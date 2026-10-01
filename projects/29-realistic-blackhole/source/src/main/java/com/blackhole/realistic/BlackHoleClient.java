package com.blackhole.realistic;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.brigadier.CommandDispatcher;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.RegisterClientCommandsEvent;
import net.neoforged.neoforge.client.event.RenderLevelStageEvent;
import org.joml.Quaternionf;
import org.joml.Vector3f;

@EventBusSubscriber(modid = BlackHoleMod.MOD_ID, value = Dist.CLIENT)
public final class BlackHoleClient {
    private static boolean enabled = true;
    private static long ticks;

    private BlackHoleClient() {
    }

    public static boolean isEnabled() {
        return enabled;
    }

    public static void setEnabled(boolean value) {
        enabled = value;
    }

    public static void toggle() {
        enabled = !enabled;
    }

    @SubscribeEvent
    public static void registerCommands(RegisterClientCommandsEvent event) {
        CommandDispatcher<CommandSourceStack> dispatcher = event.getDispatcher();
        dispatcher.register(Commands.literal("blackhole")
                .executes(context -> {
                    toggle();
                    context.getSource().sendSuccess(() -> Component.literal(
                            enabled ? "Black hole renderer enabled." : "Black hole renderer disabled."), false);
                    return 1;
                })
                .then(Commands.literal("on").executes(context -> {
                    setEnabled(true);
                    context.getSource().sendSuccess(() -> Component.literal("Black hole renderer enabled."), false);
                    return 1;
                }))
                .then(Commands.literal("off").executes(context -> {
                    setEnabled(false);
                    context.getSource().sendSuccess(() -> Component.literal("Black hole renderer disabled."), false);
                    return 1;
                })));
    }

    @SubscribeEvent
    public static void tick(net.neoforged.neoforge.client.event.ClientTickEvent.Post event) {
        if (Minecraft.getInstance().level != null) {
            ticks++;
        }
    }

    @SubscribeEvent
    public static void render(RenderLevelStageEvent.AfterWeather event) {
        if (!enabled) {
            return;
        }

        Minecraft minecraft = Minecraft.getInstance();
        if (minecraft.level == null || minecraft.player == null) {
            return;
        }

        Camera camera = minecraft.gameRenderer.getMainCamera();
        Vec3 cameraPosition = camera.position();
        Vector3f forward = new Vector3f(0.0f, 0.0f, -1.0f).rotate(camera.rotation());
        Vec3 center = cameraPosition.add(new Vec3(forward.x(), forward.y(), forward.z()).scale(12.0)).add(0.0, 0.15, 0.0);
        Vec3 relative = center.subtract(cameraPosition);

        PoseStack pose = event.getPoseStack();
        pose.pushPose();
        pose.translate(relative.x, relative.y, relative.z);
        pose.mulPose(camera.rotation());

        MultiBufferSource.BufferSource buffers = minecraft.renderBuffers().bufferSource();
        float time = ticks * 0.035f;

        RenderType diskType = RenderTypes.debugQuads();
        RenderType lineType = RenderTypes.debugQuads();
        drawDisk(pose, buffers.getBuffer(diskType), 1.55f);
        drawRing(pose, buffers.getBuffer(lineType), 1.72f, 0.98f, 0.18f, 0.025f, 0.03f, time);
        drawRing(pose, buffers.getBuffer(lineType), 2.10f, 1.00f, 0.38f, 0.045f, 0.01f, -time * 1.35f);
        drawRing(pose, buffers.getBuffer(lineType), 2.55f, 1.00f, 0.74f, 0.07f, 0.03f, time * 0.75f);
        drawRing(pose, buffers.getBuffer(lineType), 3.05f, 0.75f, 0.95f, 0.12f, 0.30f, -time * 0.55f);
        drawRing(pose, buffers.getBuffer(lineType), 3.55f, 0.30f, 0.85f, 0.10f, 0.90f, time * 0.4f);

        buffers.endBatch(diskType);
        buffers.endBatch(lineType);
        pose.popPose();
    }

    private static void drawDisk(PoseStack pose, VertexConsumer vertex, float radius) {
        vertex.addVertex(pose.last().pose(), -radius, -radius, 0).setColor(0, 0, 0, 255);
        vertex.addVertex(pose.last().pose(), radius, -radius, 0).setColor(0, 0, 0, 255);
        vertex.addVertex(pose.last().pose(), radius, radius, 0).setColor(0, 0, 0, 255);
        vertex.addVertex(pose.last().pose(), -radius, radius, 0).setColor(0, 0, 0, 255);
    }

    private static void drawRing(PoseStack pose, VertexConsumer vertex, float radius, float red, float green,
            float blue, float width, float rotation) {
        Quaternionf tilt = new Quaternionf().rotateZ(Mth.sin(rotation * 0.7f) * 0.12f)
                .rotateX(0.18f + Mth.sin(rotation) * 0.05f);
        pose.pushPose();
        pose.mulPose(tilt);
        int segments = 128;
        for (int i = 0; i < segments; i++) {
            float a0 = (i / (float) segments) * Mth.TWO_PI;
            float a1 = ((i + 1) / (float) segments) * Mth.TWO_PI;
            float pulse = 0.72f + 0.28f * Mth.sin(a0 * 5.0f + rotation * 3.0f);
            int r = (int) (Mth.clamp(red * pulse, 0.0f, 1.0f) * 255.0f);
            int g = (int) (Mth.clamp(green * pulse, 0.0f, 1.0f) * 255.0f);
            int b = (int) (Mth.clamp(blue * pulse, 0.0f, 1.0f) * 255.0f);
            addLine(vertex, pose, (float) Math.cos(a0) * radius, (float) Math.sin(a0) * radius,
                    (float) Math.cos(a1) * radius, (float) Math.sin(a1) * radius, r, g, b, (int) (width * 255));
        }
        pose.popPose();
    }

    private static void addLine(VertexConsumer vertex, PoseStack pose, float x0, float y0, float x1, float y1,
            int red, int green, int blue, int alpha) {
        float dx = x1 - x0;
        float dy = y1 - y0;
        float length = Mth.sqrt(dx * dx + dy * dy);
        float halfWidth = Mth.clamp(alpha / 255.0f, 0.003f, 0.12f) * 0.5f;
        float ox = -dy / length * halfWidth;
        float oy = dx / length * halfWidth;
        vertex.addVertex(pose.last().pose(), x0 - ox, y0 - oy, 0).setColor(red, green, blue, 255);
        vertex.addVertex(pose.last().pose(), x1 - ox, y1 - oy, 0).setColor(red, green, blue, 255);
        vertex.addVertex(pose.last().pose(), x1 + ox, y1 + oy, 0).setColor(red, green, blue, 255);
        vertex.addVertex(pose.last().pose(), x0 + ox, y0 + oy, 0).setColor(red, green, blue, 255);
    }
}
