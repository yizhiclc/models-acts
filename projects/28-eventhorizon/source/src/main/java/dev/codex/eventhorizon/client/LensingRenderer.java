package dev.codex.eventhorizon.client;

import com.mojang.blaze3d.opengl.GlTexture;
import com.mojang.blaze3d.textures.GpuTexture;
import dev.codex.eventhorizon.BlackHoleEntity;
import dev.codex.eventhorizon.EventHorizon;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import net.neoforged.neoforge.client.blaze3d.validation.ValidationGpuTexture;
import net.neoforged.neoforge.client.event.ExtractLevelRenderStateEvent;
import net.neoforged.neoforge.client.event.FrameGraphSetupEvent;
import net.neoforged.neoforge.client.event.RenderLevelStageEvent;
import org.joml.Matrix4f;
import org.lwjgl.system.MemoryStack;
import static org.lwjgl.opengl.GL33C.*;

public final class LensingRenderer implements AutoCloseable {
    private record Hole(Vec3 relativePosition, float radius, float spin, boolean disk) {}
    private List<Hole> holes = List.of();
    private final Matrix4f viewProjection = new Matrix4f();
    private final Matrix4f inverseViewProjection = new Matrix4f();
    private int program, diskProgram, vao, inputFbo, copyFbo, outputFbo, copyColor, colorSampler, depthSampler;
    private int activeProgram;
    private float diskTime;
    private int width, height;
    private boolean matricesReady, failed;
    private float skyR = 0.53F, skyG = 0.72F, skyB = 1.0F;
    public long renderedFrames;

    public void extract(ExtractLevelRenderStateEvent event) {
        Vec3 camera = event.getCamera().position();
        diskTime = (float) ((event.getLevel().getGameTime()
            + event.getDeltaTracker().getGameTimeDeltaPartialTick(false)) / 20.0);
        List<Hole> result = new ArrayList<>();
        if (ClientSettings.enabled) {
            for (Entity entity : event.getLevel().entitiesForRendering()) {
                if (entity instanceof BlackHoleEntity hole && !hole.isRemoved()
                    && camera.distanceToSqr(hole.position()) < 512 * 512) {
                    result.add(new Hole(hole.position().subtract(camera), hole.massRadius(), hole.spin(), hole.hasAccretionDisk()));
                }
            }
        }
        result.sort(Comparator.comparingDouble(hole -> hole.relativePosition.lengthSqr()));
        if (result.size() > 4) result = new ArrayList<>(result.subList(0, 4));
        // Independent lenses are composited far-to-near, not treated as a binary Kerr solution.
        result.sort(Comparator.comparingDouble((Hole hole) -> hole.relativePosition.lengthSqr()).reversed());
        holes = List.copyOf(result);
    }

    public void captureMatrices(FrameGraphSetupEvent event) {
        viewProjection.set(event.getProjectionMatrix()).mul(event.getModelViewMatrix());
        inverseViewProjection.set(viewProjection).invert();
        matricesReady = true;
    }

    public void render(RenderLevelStageEvent.AfterLevel event) {
        if (!matricesReady || failed || !ClientSettings.enabled || holes.isEmpty()) return;
        Minecraft mc = Minecraft.getInstance();
        int sky = event.getLevelRenderState().skyRenderState.skyColor;
        skyR = ((sky >> 16) & 0xFF) / 255.0F;
        skyG = ((sky >> 8) & 0xFF) / 255.0F;
        skyB = (sky & 0xFF) / 255.0F;
        var target = mc.getMainRenderTarget();
        if (!(unwrap(target.getColorTexture()) instanceof GlTexture color)
            || !(unwrap(target.getDepthTexture()) instanceof GlTexture depth)) {
            fail(new IllegalStateException("This version requires the OpenGL renderer."));
            return;
        }
        try (GlSnapshot snapshot = new GlSnapshot()) {
            initialize();
            resize(target.width, target.height);
            glDisable(GL_BLEND);
            glDisable(GL_DEPTH_TEST);
            glDisable(GL_CULL_FACE);
            glDisable(GL_SCISSOR_TEST);
            glDisable(GL_FRAMEBUFFER_SRGB);
            glDepthMask(false);
            glColorMask(true, true, true, true);
            glViewport(0, 0, width, height);
            glBindVertexArray(vao);
            glBindFramebuffer(GL_READ_FRAMEBUFFER, inputFbo);
            glFramebufferTexture2D(GL_READ_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, color.glId(), 0);
            glReadBuffer(GL_COLOR_ATTACHMENT0);
            glBindFramebuffer(GL_DRAW_FRAMEBUFFER, outputFbo);
            glFramebufferTexture2D(GL_DRAW_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, color.glId(), 0);
            glDrawBuffer(GL_COLOR_ATTACHMENT0);
            for (Hole hole : holes) {
                if (hole.disk && diskProgram == 0) diskProgram = createProgram("lensing-disk.fsh");
                activeProgram = hole.disk ? diskProgram : program;
                glUseProgram(activeProgram);
                glUniform1i(uniform("SceneColor"), 0);
                glUniform1i(uniform("SceneDepth"), 1);
                glUniform2f(uniform("Resolution"), width, height);
                glUniform3f(uniform("SkyColor"), skyR, skyG, skyB);
                glUniform1f(uniform("StepScale"), ClientSettings.highQuality ? 0.075F : 0.12F);
                glUniform1i(uniform("StepBudget"), ClientSettings.highQuality ? 448 : 300);
                if (hole.disk) {
                    glUniform1f(uniform("DiskTime"), diskTime);
                    glUniform1f(uniform("DiskInner"), AccretionDisk.innerRadius(hole.spin));
                }
                try (MemoryStack stack = MemoryStack.stackPush()) {
                    glUniformMatrix4fv(uniform("ViewProjection"), false, viewProjection.get(stack.mallocFloat(16)));
                    glUniformMatrix4fv(uniform("InverseViewProjection"), false, inverseViewProjection.get(stack.mallocFloat(16)));
                }
                glBindFramebuffer(GL_DRAW_FRAMEBUFFER, copyFbo);
                glBlitFramebuffer(0, 0, width, height, 0, 0, width, height, GL_COLOR_BUFFER_BIT, GL_NEAREST);
                glBindFramebuffer(GL_DRAW_FRAMEBUFFER, outputFbo);
                glActiveTexture(GL_TEXTURE0);
                glBindTexture(GL_TEXTURE_2D, copyColor);
                glBindSampler(0, colorSampler);
                glActiveTexture(GL_TEXTURE1);
                glBindTexture(GL_TEXTURE_2D, depth.glId());
                glBindSampler(1, depthSampler);
                glUniform3f(uniform("HolePosition"), (float) hole.relativePosition.x, (float) hole.relativePosition.y, (float) hole.relativePosition.z);
                glUniform1f(uniform("MassRadius"), hole.radius);
                glUniform1f(uniform("Spin"), hole.spin);
                glDrawArrays(GL_TRIANGLES, 0, 3);
            }
            if (renderedFrames++ == 0) {
                EventHorizon.LOGGER.info("EVENT_HORIZON_RENDER_OK {}x{}; active lenses={}; Kerr RK4", width, height, holes.size());
            }
        } catch (Exception error) {
            fail(error);
        }
    }

    private void fail(Exception error) {
        failed = true;
        EventHorizon.LOGGER.error("Black hole lensing disabled after renderer error", error);
        var player = Minecraft.getInstance().player;
        if (player != null) player.displayClientMessage(Component.literal("Event Horizon: lensing disabled. See latest.log. /blackholeview on retries."), false);
    }

    private static GpuTexture unwrap(GpuTexture texture) {
        // NeoForge wraps OpenGL textures with validation in development mode.
        while (texture instanceof ValidationGpuTexture validated) texture = validated.getRealTexture();
        return texture;
    }

    private int uniform(String name) { return glGetUniformLocation(activeProgram, name); }

    private void initialize() throws IOException {
        if (program != 0) return;
        program = createProgram("lensing.fsh");
        vao = glGenVertexArrays();
        inputFbo = glGenFramebuffers();
        outputFbo = glGenFramebuffers();
        copyFbo = glGenFramebuffers();
        colorSampler = sampler(GL_LINEAR);
        depthSampler = sampler(GL_NEAREST);
    }

    private static int createProgram(String fragmentName) throws IOException {
        int vertex = compile(GL_VERTEX_SHADER, resource("lensing.vsh"));
        int fragment = 0, candidate = 0;
        try {
            fragment = compile(GL_FRAGMENT_SHADER, resource(fragmentName));
            candidate = glCreateProgram();
            glAttachShader(candidate, vertex);
            glAttachShader(candidate, fragment);
            glLinkProgram(candidate);
            if (glGetProgrami(candidate, GL_LINK_STATUS) == GL_FALSE) throw new IOException(glGetProgramInfoLog(candidate));
            int linkedProgram = candidate;
            candidate = 0;
            return linkedProgram;
        } finally {
            glDeleteShader(vertex);
            if (fragment != 0) glDeleteShader(fragment);
            if (candidate != 0) glDeleteProgram(candidate);
        }
    }

    private static int sampler(int filter) {
        int sampler = glGenSamplers();
        glSamplerParameteri(sampler, GL_TEXTURE_MIN_FILTER, filter);
        glSamplerParameteri(sampler, GL_TEXTURE_MAG_FILTER, filter);
        glSamplerParameteri(sampler, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        glSamplerParameteri(sampler, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
        glSamplerParameteri(sampler, GL_TEXTURE_COMPARE_MODE, GL_NONE);
        return sampler;
    }

    private void resize(int newWidth, int newHeight) throws IOException {
        if (copyColor != 0 && width == newWidth && height == newHeight) return;
        if (copyColor != 0) glDeleteTextures(copyColor);
        width = newWidth;
        height = newHeight;
        copyColor = glGenTextures();
        glActiveTexture(GL_TEXTURE0);
        glBindTexture(GL_TEXTURE_2D, copyColor);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, width, height, 0, GL_RGBA, GL_UNSIGNED_BYTE, (ByteBuffer) null);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
        glBindFramebuffer(GL_DRAW_FRAMEBUFFER, copyFbo);
        glFramebufferTexture2D(GL_DRAW_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, copyColor, 0);
        glDrawBuffer(GL_COLOR_ATTACHMENT0);
        if (glCheckFramebufferStatus(GL_DRAW_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) throw new IOException("Incomplete lens framebuffer");
    }

    private static int compile(int type, String source) throws IOException {
        int shader = glCreateShader(type);
        glShaderSource(shader, source);
        glCompileShader(shader);
        if (glGetShaderi(shader, GL_COMPILE_STATUS) == GL_FALSE) {
            String error = glGetShaderInfoLog(shader);
            glDeleteShader(shader);
            throw new IOException(error);
        }
        return shader;
    }

    private static String resource(String filename) throws IOException {
        try (InputStream input = LensingRenderer.class.getResourceAsStream("/assets/eventhorizon/shaders/" + filename)) {
            if (input == null) throw new IOException("Missing shader: " + filename);
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    public String status() {
        return "Event Horizon: " + (ClientSettings.enabled ? "ON" : "OFF") + ", quality="
            + (ClientSettings.highQuality ? "high" : "balanced") + ", visible=" + holes.size()
            + ", disks=" + holes.stream().filter(Hole::disk).count()
            + ", rendered=" + renderedFrames + ", failed=" + failed;
    }

    public boolean failed() { return failed; }
    public void retry() { failed = false; }

    @Override public void close() {
        if (program != 0) glDeleteProgram(program);
        if (diskProgram != 0) glDeleteProgram(diskProgram);
        if (vao != 0) glDeleteVertexArrays(vao);
        if (inputFbo != 0) glDeleteFramebuffers(inputFbo);
        if (copyFbo != 0) glDeleteFramebuffers(copyFbo);
        if (outputFbo != 0) glDeleteFramebuffers(outputFbo);
        if (copyColor != 0) glDeleteTextures(copyColor);
        if (colorSampler != 0) glDeleteSamplers(colorSampler);
        if (depthSampler != 0) glDeleteSamplers(depthSampler);
        program = diskProgram = activeProgram = vao = inputFbo = copyFbo = outputFbo = copyColor = colorSampler = depthSampler = 0;
    }

    // Restore actual driver state so Minecraft's cached state remains valid.
    private static final class GlSnapshot implements AutoCloseable {
        private final int program = glGetInteger(GL_CURRENT_PROGRAM);
        private final int vao = glGetInteger(GL_VERTEX_ARRAY_BINDING);
        private final int readFbo = glGetInteger(GL_READ_FRAMEBUFFER_BINDING);
        private final int drawFbo = glGetInteger(GL_DRAW_FRAMEBUFFER_BINDING);
        private final int active = glGetInteger(GL_ACTIVE_TEXTURE);
        private final int[] viewport = new int[4];
        private final int[] textures = new int[2];
        private final int[] samplers = new int[2];
        private final boolean blend = glIsEnabled(GL_BLEND), depth = glIsEnabled(GL_DEPTH_TEST);
        private final boolean cull = glIsEnabled(GL_CULL_FACE), scissor = glIsEnabled(GL_SCISSOR_TEST);
        private final boolean srgb = glIsEnabled(GL_FRAMEBUFFER_SRGB), depthMask = glGetBoolean(GL_DEPTH_WRITEMASK);
        private final boolean[] colorMask = new boolean[4];

        private GlSnapshot() {
            glGetIntegerv(GL_VIEWPORT, viewport);
            try (MemoryStack stack = MemoryStack.stackPush()) {
                ByteBuffer buffer = stack.malloc(4);
                glGetBooleanv(GL_COLOR_WRITEMASK, buffer);
                for (int i = 0; i < 4; i++) colorMask[i] = buffer.get(i) != 0;
            }
            for (int i = 0; i < 2; i++) {
                glActiveTexture(GL_TEXTURE0 + i);
                textures[i] = glGetInteger(GL_TEXTURE_BINDING_2D);
                samplers[i] = glGetInteger(GL_SAMPLER_BINDING);
            }
        }

        private void enabled(int flag, boolean enabled) { if (enabled) glEnable(flag); else glDisable(flag); }

        @Override public void close() {
            glUseProgram(program);
            glBindVertexArray(vao);
            glBindFramebuffer(GL_READ_FRAMEBUFFER, readFbo);
            glBindFramebuffer(GL_DRAW_FRAMEBUFFER, drawFbo);
            for (int i = 0; i < 2; i++) {
                glActiveTexture(GL_TEXTURE0 + i);
                glBindTexture(GL_TEXTURE_2D, textures[i]);
                glBindSampler(i, samplers[i]);
            }
            glActiveTexture(active);
            glViewport(viewport[0], viewport[1], viewport[2], viewport[3]);
            enabled(GL_BLEND, blend);
            enabled(GL_DEPTH_TEST, depth);
            enabled(GL_CULL_FACE, cull);
            enabled(GL_SCISSOR_TEST, scissor);
            enabled(GL_FRAMEBUFFER_SRGB, srgb);
            glDepthMask(depthMask);
            glColorMask(colorMask[0], colorMask[1], colorMask[2], colorMask[3]);
        }
    }
}
