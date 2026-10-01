package dev.codex.eventhorizon;

import com.mojang.logging.LogUtils;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;
import org.slf4j.Logger;

@Mod(EventHorizon.ID)
public final class EventHorizon {
    public static final String ID = "eventhorizon";
    public static final Logger LOGGER = LogUtils.getLogger();
    private static final DeferredRegister.Entities ENTITIES = DeferredRegister.createEntities(ID);
    public static final DeferredHolder<EntityType<?>, EntityType<BlackHoleEntity>> BLACK_HOLE =
        ENTITIES.registerEntityType("black_hole", BlackHoleEntity::new, MobCategory.MISC,
            builder -> builder.sized(0.1F, 0.1F).clientTrackingRange(32).updateInterval(20).fireImmune());

    public EventHorizon(IEventBus modBus) {
        ENTITIES.register(modBus);
        NeoForge.EVENT_BUS.addListener(BlackHoleCommands::register);
    }
}
