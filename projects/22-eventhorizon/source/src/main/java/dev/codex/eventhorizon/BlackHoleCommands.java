package dev.codex.eventhorizon;

import com.mojang.brigadier.arguments.FloatArgumentType;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.coordinates.Vec3Argument;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import net.neoforged.neoforge.event.RegisterCommandsEvent;

public final class BlackHoleCommands {
    private BlackHoleCommands() {}

    public static void register(RegisterCommandsEvent event) {
        event.getDispatcher().register(Commands.literal("blackhole")
            .requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
            .executes(ctx -> help(ctx.getSource()))
            .then(Commands.literal("spawn")
                .executes(ctx -> spawnAhead(ctx.getSource(), 1.5F, 0.94F))
                .then(Commands.argument("size", FloatArgumentType.floatArg(0.25F, 12F))
                    .executes(ctx -> spawnAhead(ctx.getSource(), FloatArgumentType.getFloat(ctx, "size"), 0.94F))
                    .then(Commands.argument("spin", FloatArgumentType.floatArg(-0.998F, 0.998F))
                        .executes(ctx -> spawnAhead(ctx.getSource(), FloatArgumentType.getFloat(ctx, "size"), FloatArgumentType.getFloat(ctx, "spin"))))))
            .then(Commands.literal("at")
                .then(Commands.argument("position", Vec3Argument.vec3())
                    .executes(ctx -> spawn(ctx.getSource(), Vec3Argument.getVec3(ctx, "position"), 1.5F, 0.94F))
                    .then(Commands.argument("size", FloatArgumentType.floatArg(0.25F, 12F))
                        .executes(ctx -> spawn(ctx.getSource(), Vec3Argument.getVec3(ctx, "position"), FloatArgumentType.getFloat(ctx, "size"), 0.94F))
                        .then(Commands.argument("spin", FloatArgumentType.floatArg(-0.998F, 0.998F))
                            .executes(ctx -> spawn(ctx.getSource(), Vec3Argument.getVec3(ctx, "position"),
                                FloatArgumentType.getFloat(ctx, "size"), FloatArgumentType.getFloat(ctx, "spin")))))))
            .then(Commands.literal("remove").executes(ctx -> remove(ctx.getSource(), false)))
            .then(Commands.literal("clear").executes(ctx -> remove(ctx.getSource(), true)))
            .then(Commands.literal("disk")
                .executes(ctx -> spawnDiskAhead(ctx.getSource(), 1.5F, 0.94F))
                .then(Commands.argument("size", FloatArgumentType.floatArg(0.25F, 12F))
                    .executes(ctx -> spawnDiskAhead(ctx.getSource(), FloatArgumentType.getFloat(ctx, "size"), 0.94F))
                    .then(Commands.argument("spin", FloatArgumentType.floatArg(-0.998F, 0.998F))
                        .executes(ctx -> spawnDiskAhead(ctx.getSource(), FloatArgumentType.getFloat(ctx, "size"), FloatArgumentType.getFloat(ctx, "spin")))))
                .then(Commands.literal("at")
                    .then(Commands.argument("position", Vec3Argument.vec3())
                        .executes(ctx -> spawn(ctx.getSource(), Vec3Argument.getVec3(ctx, "position"), 1.5F, 0.94F, true))
                        .then(Commands.argument("size", FloatArgumentType.floatArg(0.25F, 12F))
                            .executes(ctx -> spawn(ctx.getSource(), Vec3Argument.getVec3(ctx, "position"), FloatArgumentType.getFloat(ctx, "size"), 0.94F, true))
                            .then(Commands.argument("spin", FloatArgumentType.floatArg(-0.998F, 0.998F))
                                .executes(ctx -> spawn(ctx.getSource(), Vec3Argument.getVec3(ctx, "position"),
                                    FloatArgumentType.getFloat(ctx, "size"), FloatArgumentType.getFloat(ctx, "spin"), true)))))))
            .then(Commands.literal("list").executes(ctx -> list(ctx.getSource()))));
    }

    private static int help(CommandSourceStack source) {
        source.sendSuccess(() -> Component.literal("/blackhole spawn [size] [spin] | disk [size] [spin] | [disk] at <x y z> [size] [spin] | remove | clear | list"), false);
        return 1;
    }

    private static int spawnAhead(CommandSourceStack source, float radius, float spin) throws CommandSyntaxException {
        var player = source.getPlayerOrException();
        Vec3 position = player.getEyePosition().add(player.getLookAngle().scale(Math.max(24, radius * 16)));
        return spawn(source, position, radius, spin);
    }

    public static int spawn(CommandSourceStack source, Vec3 position, float radius, float spin) {
        return spawn(source, position, radius, spin, false);
    }

    private static int spawnDiskAhead(CommandSourceStack source, float radius, float spin) throws CommandSyntaxException {
        var player = source.getPlayerOrException();
        Vec3 position = player.getEyePosition().add(player.getLookAngle().scale(Math.max(48, radius * 32)));
        return spawn(source, position, radius, spin, true);
    }

    private static int spawn(CommandSourceStack source, Vec3 position, float radius, float spin, boolean disk) {
        ServerLevel level = source.getLevel();
        if (!Double.isFinite(position.x) || !Double.isFinite(position.y) || !Double.isFinite(position.z)
            || Math.abs(position.x) > 29_999_984 || Math.abs(position.z) > 29_999_984
            || position.y < level.getMinY() || position.y > level.getMaxY() + 128) {
            source.sendFailure(Component.literal("Position is outside the supported world bounds."));
            return 0;
        }
        if (holes(level).size() >= 4) {
            source.sendFailure(Component.literal("Maximum 4 loaded black holes per dimension. Use /blackhole remove."));
            return 0;
        }
        BlackHoleEntity hole = new BlackHoleEntity(EventHorizon.BLACK_HOLE.get(), level);
        hole.setPos(position);
        hole.configure(radius, spin);
        hole.setAccretionDisk(disk);
        if (!level.addFreshEntity(hole)) {
            source.sendFailure(Component.literal("Could not create black hole."));
            return 0;
        }
        source.sendSuccess(() -> Component.literal(String.format(Locale.ROOT,
            "Black hole created at %.1f %.1f %.1f | rg=%.2f blocks | spin=%+.3f | disk=%s | /blackhole remove",
            position.x, position.y, position.z, radius, spin, disk ? "ON" : "OFF")), true);
        return 1;
    }

    private static List<BlackHoleEntity> holes(ServerLevel level) {
        List<BlackHoleEntity> result = new ArrayList<>();
        for (Entity entity : level.getAllEntities()) {
            if (entity instanceof BlackHoleEntity hole && !hole.isRemoved()) result.add(hole);
        }
        return result;
    }

    private static int remove(CommandSourceStack source, boolean all) {
        List<BlackHoleEntity> holes = holes(source.getLevel());
        holes.sort(Comparator.comparingDouble(hole -> hole.position().distanceToSqr(source.getPosition())));
        int count = all ? holes.size() : Math.min(1, holes.size());
        for (int i = 0; i < count; i++) holes.get(i).discard();
        source.sendSuccess(() -> Component.literal("Removed " + count + " loaded black hole(s) in this dimension."), true);
        return count;
    }

    private static int list(CommandSourceStack source) {
        List<BlackHoleEntity> holes = holes(source.getLevel());
        for (BlackHoleEntity hole : holes) {
            source.sendSuccess(() -> Component.literal(String.format(Locale.ROOT,
                "%s @ %.1f %.1f %.1f | rg=%.2f | spin=%+.3f | disk=%s",
                hole.getUUID(), hole.getX(), hole.getY(), hole.getZ(), hole.massRadius(), hole.spin(),
                hole.hasAccretionDisk() ? "ON" : "OFF")), false);
        }
        source.sendSuccess(() -> Component.literal(holes.size() + " loaded black hole(s)."), false);
        return holes.size();
    }
}
