package dev.codex.eventhorizon;

import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.Vec3;

public final class BlackHoleEntity extends Entity {
    private static final EntityDataAccessor<Float> MASS_RADIUS =
        SynchedEntityData.defineId(BlackHoleEntity.class, EntityDataSerializers.FLOAT);
    private static final EntityDataAccessor<Float> SPIN =
        SynchedEntityData.defineId(BlackHoleEntity.class, EntityDataSerializers.FLOAT);
    private static final EntityDataAccessor<Boolean> ACCRETION_DISK =
        SynchedEntityData.defineId(BlackHoleEntity.class, EntityDataSerializers.BOOLEAN);

    public BlackHoleEntity(EntityType<? extends BlackHoleEntity> type, Level level) {
        super(type, level);
        noPhysics = true;
        setNoGravity(true);
        setInvulnerable(true);
        setInvisible(true);
    }

    @Override protected void defineSynchedData(SynchedEntityData.Builder builder) {
        builder.define(MASS_RADIUS, 1.5F);
        builder.define(SPIN, 0.94F);
        builder.define(ACCRETION_DISK, false);
    }

    public float massRadius() { return entityData.get(MASS_RADIUS); }
    public float spin() { return entityData.get(SPIN); }
    public boolean hasAccretionDisk() { return entityData.get(ACCRETION_DISK); }
    public void setAccretionDisk(boolean enabled) { entityData.set(ACCRETION_DISK, enabled); }

    public void configure(float radius, float spin) {
        entityData.set(MASS_RADIUS, Float.isFinite(radius) ? Mth.clamp(radius, 0.25F, 12F) : 1.5F);
        entityData.set(SPIN, Float.isFinite(spin) ? Mth.clamp(spin, -0.998F, 0.998F) : 0.94F);
    }

    @Override public void tick() { setDeltaMovement(Vec3.ZERO); }
    @Override public boolean hurtServer(ServerLevel level, DamageSource source, float amount) { return false; }
    @Override public boolean isPickable() { return false; }
    @Override public boolean isPushable() { return false; }
    @Override public boolean canBeCollidedWith(Entity entity) { return false; }
    @Override public boolean shouldRenderAtSqrDistance(double distance) { return false; }

    @Override protected void readAdditionalSaveData(ValueInput input) {
        configure(input.getFloatOr("MassRadius", 1.5F), input.getFloatOr("Spin", 0.94F));
        setAccretionDisk(input.getBooleanOr("AccretionDisk", false));
    }

    @Override protected void addAdditionalSaveData(ValueOutput output) {
        output.putFloat("MassRadius", massRadius());
        output.putFloat("Spin", spin());
        output.putBoolean("AccretionDisk", hasAccretionDisk());
    }
}
