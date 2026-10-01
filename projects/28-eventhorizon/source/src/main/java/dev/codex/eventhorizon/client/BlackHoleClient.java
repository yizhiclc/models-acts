package dev.codex.eventhorizon.client;

import dev.codex.eventhorizon.EventHorizon;
import net.minecraft.client.renderer.entity.NoopRenderer;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;
import net.neoforged.neoforge.client.event.RegisterClientCommandsEvent;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.GameShuttingDownEvent;

@Mod(value = EventHorizon.ID, dist = Dist.CLIENT)
public final class BlackHoleClient {
    public static final LensingRenderer RENDERER = new LensingRenderer();

    public BlackHoleClient(IEventBus modBus) {
        ClientSettings.load();
        modBus.addListener(this::renderers);
        NeoForge.EVENT_BUS.addListener(RENDERER::extract);
        NeoForge.EVENT_BUS.addListener(RENDERER::captureMatrices);
        NeoForge.EVENT_BUS.addListener(RENDERER::render);
        NeoForge.EVENT_BUS.addListener(this::commands);
        NeoForge.EVENT_BUS.addListener(this::shutdown);
    }

    private void renderers(EntityRenderersEvent.RegisterRenderers event) {
        event.registerEntityRenderer(EventHorizon.BLACK_HOLE.get(), NoopRenderer::new);
    }

    private void shutdown(GameShuttingDownEvent event) { RENDERER.close(); }

    private void commands(RegisterClientCommandsEvent event) {
        event.getDispatcher().register(Commands.literal("blackholeview")
            .executes(ctx -> {
                ctx.getSource().sendSuccess(() -> Component.literal(RENDERER.status()), false);
                return 1;
            })
            .then(Commands.literal("on").executes(ctx -> {
                ClientSettings.enabled = true;
                RENDERER.retry();
                ClientSettings.save();
                ctx.getSource().sendSuccess(() -> Component.literal("Black hole lensing ON."), false);
                return 1;
            }))
            .then(Commands.literal("off").executes(ctx -> {
                ClientSettings.enabled = false;
                ClientSettings.save();
                ctx.getSource().sendSuccess(() -> Component.literal("Black hole lensing OFF. Entities are unchanged."), false);
                return 1;
            }))
            .then(Commands.literal("quality")
                .then(Commands.literal("balanced").executes(ctx -> {
                    ClientSettings.highQuality = false;
                    ClientSettings.save();
                    ctx.getSource().sendSuccess(() -> Component.literal("Balanced integration; full screen resolution."), false);
                    return 1;
                }))
                .then(Commands.literal("high").executes(ctx -> {
                    ClientSettings.highQuality = true;
                    ClientSettings.save();
                    ctx.getSource().sendSuccess(() -> Component.literal("High integration; full screen resolution."), false);
                    return 1;
                }))));
    }
}
