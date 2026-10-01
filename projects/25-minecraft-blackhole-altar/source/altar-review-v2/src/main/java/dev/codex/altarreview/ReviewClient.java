package dev.codex.altarreview;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.core.HolderSet;
import net.minecraft.core.registries.Registries;
import net.minecraft.world.Difficulty;
import net.minecraft.world.flag.FeatureFlags;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.levelgen.FlatLevelSource;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.flat.FlatLayerInfo;
import net.minecraft.world.level.levelgen.flat.FlatLevelGeneratorSettings;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.RenderFrameEvent;

@EventBusSubscriber(modid=ReviewBuilder.ID,value=Dist.CLIENT)
public final class ReviewClient {
    private static int phase,ticks,view=-1;
    private static volatile boolean finish;
    private static String shot;
    private record View(String name,double x,double y,double z,double tx,double ty,double tz) {}
    private static final View[] VIEWS={
        new View("01-overall-clean.png",-118,147,-149,0,111,0),
        new View("02-front-symmetry.png",0,128,-194,0,110,0),
        new View("03-rear-clean.png",118,147,149,0,111,0),
        new View("04-side-supports.png",175,119,0,0,109,0),
        new View("05-grounded-pier-detail.png",97,117,-7,36,99,-18),
        new View("06-stair-landings.png",-20,108,-61,0,87,-43),
        new View("07-sanctuary-detail.png",27,129,-38,0,109,0),
        new View("08-front-arcades.png",25,82,-80,29,76,-53),
        new View("09-blackhole-overall.png",-118,147,-149,0,111,0),
        new View("10-blackhole-sanctuary.png",-24,141,-72,0,128,0),
        new View("11-night-lighting.png",-118,147,-149,0,111,0)
    };
    @SubscribeEvent
    public static void tick(ClientTickEvent.Post event) {
        if(!Boolean.getBoolean("altarreview.auto")) return;
        var mc=Minecraft.getInstance();
        if(finish) { mc.stop();return; }
        if(phase==0&&mc.screen!=null&&mc.screen.getClass().getSimpleName().equals("AccessibilityOnboardingScreen")) {
            mc.options.onboardAccessibility=false;mc.options.save();mc.setScreen(new TitleScreen());
        }
        if(phase==0&&mc.screen instanceof TitleScreen&&mc.getOverlay()==null) {
            phase=1;
            mc.options.pauseOnLostFocus=false;
            mc.options.renderDistance().set(28);mc.options.simulationDistance().set(5);
            mc.options.bobView().set(false);mc.options.fov().set(60);
            mc.options.enableVsync().set(false);mc.options.framerateLimit().set(90);
            mc.options.hideGui=true;mc.options.save();
            Path world=mc.gameDirectory.toPath().resolve("saves").resolve(ReviewBuilder.WORLD);
            if(Files.exists(world)) mc.createWorldOpenFlows().openWorld(ReviewBuilder.WORLD,mc::stop);
            else {
                var rules=new GameRules(FeatureFlags.VANILLA_SET);
                rules.set(GameRules.ADVANCE_TIME,false,null);
                rules.set(GameRules.ADVANCE_WEATHER,false,null);
                rules.set(GameRules.SPAWN_MOBS,false,null);
                rules.set(GameRules.SHOW_ADVANCEMENT_MESSAGES,false,null);
                var settings=new LevelSettings(ReviewBuilder.WORLD,GameType.CREATIVE,false,Difficulty.PEACEFUL,true,rules,WorldDataConfiguration.DEFAULT);
                mc.createWorldOpenFlows().createFreshLevel(ReviewBuilder.WORLD,settings,new WorldOptions(20260925L,false,false),registries->{
                    var flat=new FlatLevelGeneratorSettings(Optional.of(HolderSet.direct()),
                        registries.lookupOrThrow(Registries.BIOME).getOrThrow(Biomes.PLAINS),List.of());
                    flat.getLayersInfo().addAll(List.of(new FlatLayerInfo(1,Blocks.BEDROCK),new FlatLayerInfo(123,Blocks.STONE),
                        new FlatLayerInfo(3,Blocks.DIRT),new FlatLayerInfo(1,Blocks.GRASS_BLOCK)));
                    flat.updateLayers();
                    return WorldPresets.createFlatWorldDimensions(registries).replaceOverworldGenerator(registries,new FlatLevelSource(flat));
                },mc.screen);
            }
        }
        if(phase==1&&mc.player!=null&&mc.getSingleplayerServer()!=null&&mc.screen==null) {
            phase=2;
            var server=mc.getSingleplayerServer();
            var uuid=mc.player.getUUID();
            server.execute(()->{
                var player=server.getPlayerList().getPlayer(uuid);
                player.setGameMode(GameType.SPECTATOR);
                player.teleportTo(server.overworld(),0,140,-120,Set.of(),0,18,false);
                server.overworld().setDayTime(6000);
                server.overworld().setWeatherParameters(1000000,0,false,false);
                server.getCommands().performPrefixedCommand(server.createCommandSourceStack(),"blackhole clear");
                server.getCommands().performPrefixedCommand(server.createCommandSourceStack(),"setworldspawn 0 64 -79");
                ReviewBuilder.begin(server);
            });
        }
        if(phase==2&&ReviewBuilder.built) { phase=3;ticks=0; }
        if(phase!=3||mc.screen!=null) return;
        if(++ticks==300) move(mc,++view);
        if(ticks==480) shot=VIEWS[view].name;
        if(ticks>=520&&shot==null) {
            if(view+1<VIEWS.length) { move(mc,++view);ticks=300; }
            else {
                phase=4;
                var server=mc.getSingleplayerServer();
                var uuid=mc.player.getUUID();
                server.execute(()->{
                    server.overworld().setDayTime(6000);
                    var player=server.getPlayerList().getPlayer(uuid);
                    player.teleportTo(server.overworld(),0,128,-185,Set.of(),0,6,false);
                    server.saveEverything(true,false,true);
                    try { Files.writeString(mc.gameDirectory.toPath().resolve("review-ready.txt"),"Completed review world and eleven stills. No construction film recorded."); }
                    catch(Exception e) { ReviewBuilder.LOG.error("Review marker",e); }
                    ReviewBuilder.LOG.info("REVIEW_READY_FOR_APPROVAL");
                    finish=true;
                });
            }
        }
    }
    private static void move(Minecraft mc,int index) {
        var v=VIEWS[index];
        double dx=v.tx-v.x,dy=v.ty-v.y,dz=v.tz-v.z;
        float yaw=(float)Math.toDegrees(Math.atan2(-dx,dz));
        float pitch=(float)-Math.toDegrees(Math.atan2(dy,Math.hypot(dx,dz)));
        var server=mc.getSingleplayerServer();
        var uuid=mc.player.getUUID();
        server.execute(()->{
            // Saved entities may finish loading after the initial world-open cleanup.
            if(index<=8) server.getCommands().performPrefixedCommand(server.createCommandSourceStack(),"blackhole clear");
            if(index==8) {
                server.getCommands().performPrefixedCommand(server.createCommandSourceStack(),"blackhole disk at 0 130 0 1.5 0.94");
                server.getCommands().performPrefixedCommand(server.createCommandSourceStack(),"blackhole list");
            }
            if(index==10) server.overworld().setDayTime(18000);
            server.getPlayerList().getPlayer(uuid).teleportTo(server.overworld(),v.x,v.y,v.z,Set.of(),yaw,pitch,false);
        });
        ReviewBuilder.LOG.info("REVIEW_VIEW {}",v.name);
    }
    @SubscribeEvent
    public static void frame(RenderFrameEvent.Post event) {
        if(shot==null) return;
        var mc=Minecraft.getInstance();
        if(mc.level==null||mc.screen!=null) return;
        String name=shot;shot=null;
        Screenshot.grab(mc.gameDirectory,name,mc.getMainRenderTarget(),1,ignored->{});
        ReviewBuilder.LOG.info("REVIEW_SCREENSHOT {}",name);
    }
}
