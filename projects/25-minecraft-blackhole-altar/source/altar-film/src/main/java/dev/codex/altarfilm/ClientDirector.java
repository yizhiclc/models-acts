package dev.codex.altarfilm;

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
import net.minecraft.world.level.storage.LevelResource;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.RenderFrameEvent;
import org.lwjgl.glfw.GLFW;

@EventBusSubscriber(modid=AltarFilm.ID,value=Dist.CLIENT)
public final class ClientDirector {
    public static volatile boolean requestQuit;
    public static volatile String nextWorld;
    private static int phase,ticks;
    private static long readyAt,frameStart;
    private static long frames;
    private static String name;
    private static boolean savedShot;
    private static boolean auto() {
        return Boolean.getBoolean("altarfilm.auto") || Files.exists(Minecraft.getInstance().gameDirectory.toPath().resolve("altarfilm-autostart.txt"));
    }
    @SubscribeEvent
    public static void tick(ClientTickEvent.Post event) {
        Minecraft mc=Minecraft.getInstance();
        if(requestQuit) {mc.stop();return;}
        if(!auto()) return;
        if(nextWorld!=null) {
            String requested=nextWorld;nextWorld=null;
            if(!requested.startsWith("AltarFilm-") || requested.contains("/") || requested.contains("\\")) return;
            try {
                Files.writeString(mc.gameDirectory.toPath().resolve("altarfilm-next-world.txt"),requested);
                mc.stop();
            } catch(Exception e) {AltarFilm.LOG.error("Cannot request next world",e);}
            return;
        }
        if(phase==0 && mc.screen!=null && mc.screen.getClass().getSimpleName().equals("AccessibilityOnboardingScreen")) {
            mc.options.onboardAccessibility=false;mc.options.save();mc.setScreen(new TitleScreen());
        }
        if(phase==0 && mc.screen instanceof TitleScreen && mc.getOverlay()==null) {
            phase=1;
            AltarFilm.resetSession();
            name="AltarFilm-Rehearsal-20260912";
            try {
                Path requested=mc.gameDirectory.toPath().resolve("altarfilm-next-world.txt");
                if(Files.exists(requested)) name=Files.readString(requested).trim();
            } catch(Exception e) {AltarFilm.LOG.warn("World name read failed",e);}
            if(!name.startsWith("AltarFilm-") || name.contains("/") || name.contains("\\")) {mc.stop();return;}
            mc.options.pauseOnLostFocus=false;
            mc.options.renderDistance().set(16);mc.options.simulationDistance().set(5);
            mc.options.bobView().set(false);mc.options.fov().set(60);
            mc.options.enableVsync().set(false);mc.options.framerateLimit().set(120);
            mc.options.hideGui=true;
            mc.options.save();
            GLFW.glfwSetWindowTitle(mc.getWindow().handle(),"Altar Film | Minecraft 1.21.11");
            GLFW.glfwSetWindowSize(mc.getWindow().handle(),1920,1080);
            GLFW.glfwSetWindowPos(mc.getWindow().handle(),250,140);
            if(Files.exists(mc.gameDirectory.toPath().resolve("saves").resolve(name))) {
                mc.createWorldOpenFlows().openWorld(name,mc::stop);
            } else {
                var rules=new GameRules(FeatureFlags.VANILLA_SET);
                rules.set(GameRules.ADVANCE_TIME,false,null);
                rules.set(GameRules.ADVANCE_WEATHER,false,null);
                rules.set(GameRules.SPAWN_MOBS,false,null);
                rules.set(GameRules.SHOW_ADVANCEMENT_MESSAGES,false,null);
                var settings=new LevelSettings(name,GameType.CREATIVE,false,Difficulty.PEACEFUL,true,rules,WorldDataConfiguration.DEFAULT);
                mc.createWorldOpenFlows().createFreshLevel(name,settings,new WorldOptions(20260912L,false,false),registries-> {
                    var flat=new FlatLevelGeneratorSettings(Optional.of(HolderSet.direct()),
                        registries.lookupOrThrow(Registries.BIOME).getOrThrow(Biomes.PLAINS),List.of());
                    flat.getLayersInfo().addAll(List.of(new FlatLayerInfo(1,Blocks.BEDROCK),
                        new FlatLayerInfo(123,Blocks.STONE),new FlatLayerInfo(3,Blocks.DIRT),new FlatLayerInfo(1,Blocks.GRASS_BLOCK)));
                    flat.updateLayers();
                    return WorldPresets.createFlatWorldDimensions(registries).replaceOverworldGenerator(registries,new FlatLevelSource(flat));
                },mc.screen);
            }
        }
        if(phase==1 && mc.player!=null && mc.getSingleplayerServer()!=null && mc.screen==null) {
            phase=2;
            var server=mc.getSingleplayerServer();
            var uuid=mc.player.getUUID();
            server.execute(()->{
                try {
                    Path marker=server.getWorldPath(LevelResource.ROOT).resolve("altarfilm-owned.txt");
                    // Only the automatically created, dedicated production namespace is marked.
                    Files.writeString(marker,"Altar Film dedicated production world; bounds -64..64, Y63..170.");
                    var player=server.getPlayerList().getPlayer(uuid);
                    var level=server.overworld();
                    level.setDayTime(5500);
                    level.setWeatherParameters(1000000,0,false,false);
                    player.setGameMode(GameType.SPECTATOR);
                    player.teleportTo(level,0,130,0,Set.of(),0,0,false);
                    server.getCommands().performPrefixedCommand(server.createCommandSourceStack(),"setworldspawn 0 94 -20");
                    server.getCommands().performPrefixedCommand(server.createCommandSourceStack(),"forceload add -160 -192 160 160");
                    // Warm up the filming footprint before exposing the ready state.
                    for(int x=-5;x<=5;x++) for(int z=-5;z<=5;z++) level.getChunk(x,z);
                    AltarFilm.prepare(server.createCommandSourceStack());
                    readyAt=System.currentTimeMillis();
                } catch(Exception e) {AltarFilm.LOG.error("ALTAR_FILM_WORLD_FAILURE",e);}
            });
        }
        if(phase==2 && AltarFilm.ready && System.currentTimeMillis()-readyAt>15000) {
            phase=3;
            AltarFilm.LOG.info("ALTAR_FILM_CLIENT_READY {}x{}",mc.getWindow().getWidth(),mc.getWindow().getHeight());
        }
        if(++ticks%20==0 && mc.level!=null) {
            try {
                var dir=mc.gameDirectory.toPath().resolve("altarfilm-control");
                Files.createDirectories(dir);
                Files.writeString(dir.resolve("client.json"),"{\"phase\":"+phase+",\"fps\":"+mc.getFps()+
                    ",\"width\":"+mc.getWindow().getWidth()+",\"height\":"+mc.getWindow().getHeight()+"}");
            } catch(Exception ignored) {}
        }
    }
    @SubscribeEvent
    public static void frame(RenderFrameEvent.Post event) {
        Minecraft mc=Minecraft.getInstance();
        if(mc.level==null || mc.screen!=null || !auto()) return;
        if(frameStart==0) frameStart=System.nanoTime();
        frames++;
        Path request=mc.gameDirectory.toPath().resolve("altarfilm-control/screenshot.txt");
        if(Files.exists(request)) {
            try {
                String filename=Files.readString(request).trim();
                Files.delete(request);
                if(filename.matches("[a-zA-Z0-9._-]+\\.png"))
                    Screenshot.grab(mc.gameDirectory,filename,mc.getMainRenderTarget(),1,ignored->{});
            } catch(Exception e) {AltarFilm.LOG.warn("Screenshot failed",e);}
        }
        if(AltarFilm.status.equals("complete")&&!savedShot) {
            savedShot=true;
            Screenshot.grab(mc.gameDirectory,"altar-final.png",mc.getMainRenderTarget(),1,ignored->{});
            AltarFilm.LOG.info("ALTAR_FILM_RENDER_STATS frames={} elapsed={}",frames,(System.nanoTime()-frameStart)/1e9);
        }
    }
}
