package dev.codex.altarfilm;

import com.google.gson.Gson;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPInputStream;
import net.minecraft.commands.arguments.blocks.BlockStateParser;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

public final class FilmData {
    public static final FilmData INSTANCE = load();
    public double duration;
    public String blackHoleCommand;
    public String[] palette;
    public double[][] events;
    public double[][] camera;
    public Stage[] stages;
    private transient BlockState[] states;
    public record Stage(String name, double start, double end, int count) {}
    public record Pose(Vec3 position, float yaw, float pitch) {}

    private static FilmData load() {
        try (var in = new GZIPInputStream(FilmData.class.getResourceAsStream("/altarfilm/blueprint.json.gz"))) {
            return new Gson().fromJson(new InputStreamReader(in, StandardCharsets.UTF_8), FilmData.class);
        } catch (Exception e) {
            throw new IllegalStateException("Cannot read altar blueprint", e);
        }
    }

    public void resolveStates() {
        if (states != null) return;
        states = new BlockState[palette.length];
        for (int i = 0; i < states.length; i++) {
            try {
                states[i] = BlockStateParser.parseForBlock(BuiltInRegistries.BLOCK, palette[i], false).blockState();
            } catch (Exception e) {
                throw new IllegalArgumentException("Invalid palette state " + palette[i], e);
            }
        }
    }
    public BlockState state(double[] e) { return states[(int)e[4]]; }
    public BlockPos position(double[] e) { return new BlockPos((int)e[1], (int)e[2], (int)e[3]); }

    public Pose pose(double time) {
        double index = Math.clamp(time * 4, 0, camera.length - 1.000001);
        int i = (int)index;
        double u = index - i;
        double[] value = new double[6];
        for (int k = 1; k <= 6; k++) {
            double a = camera[Math.max(0, i-1)][k], b = camera[i][k];
            double c = camera[Math.min(camera.length-1, i+1)][k], d = camera[Math.min(camera.length-1, i+2)][k];
            value[k-1] = .5 * ((2*b) + (-a+c)*u + (2*a-5*b+4*c-d)*u*u + (-a+3*b-3*c+d)*u*u*u);
        }
        Vec3 pos = new Vec3(value[0],value[1],value[2]);
        Vec3 aim = new Vec3(value[3],value[4],value[5]).subtract(pos);
        float yaw = (float)Math.toDegrees(Math.atan2(-aim.x, aim.z));
        float pitch = (float)-Math.toDegrees(Math.atan2(aim.y, Math.hypot(aim.x,aim.z)));
        return new Pose(pos, yaw, pitch);
    }
}
