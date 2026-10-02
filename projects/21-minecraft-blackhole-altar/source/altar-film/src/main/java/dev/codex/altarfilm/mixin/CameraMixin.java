package dev.codex.altarfilm.mixin;

import dev.codex.altarfilm.AltarFilm;
import dev.codex.altarfilm.FilmData;
import net.minecraft.client.Camera;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Camera.class)
public abstract class CameraMixin {
    @Shadow protected abstract void setPosition(Vec3 position);
    @Shadow protected abstract void setRotation(float yaw, float pitch, float roll);
    @Inject(method="setup",at=@At("TAIL"))
    private void altarfilm$camera(Level level, Entity entity, boolean detached, boolean mirror, float partial, CallbackInfo ci) {
        if(!AltarFilm.cameraEnabled) return;
        var pose=FilmData.INSTANCE.pose(AltarFilm.renderTime());
        setPosition(pose.position());
        setRotation(pose.yaw(),pose.pitch(),0);
    }
}
