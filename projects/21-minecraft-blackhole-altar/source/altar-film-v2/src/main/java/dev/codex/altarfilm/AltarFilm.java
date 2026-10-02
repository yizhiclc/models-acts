package dev.codex.altarfilm;

import com.google.gson.Gson;
import com.mojang.brigadier.arguments.DoubleArgumentType;
import com.mojang.logging.LogUtils;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.Set;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.storage.LevelResource;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.event.RegisterCommandsEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;
import org.slf4j.Logger;

@Mod(AltarFilm.ID)
@EventBusSubscriber(modid = AltarFilm.ID)
public final class AltarFilm {
    public static final String ID = "altarfilm";
    public static final Logger LOG = LogUtils.getLogger();
    public static volatile boolean active, cameraEnabled, ready;
    public static volatile double playhead;
    public static volatile long clockNanos;
    public static volatile String status = "idle";
    public static volatile int placed;
    private static double previewEnd = -1;
    private static int tick, stage = -1;
    private static long lastNanos;
    private static boolean spawned;
    private static Path controlDirectory;

    public static boolean permitted(MinecraftServer server) {
        if (server == null || !server.getWorldData().getLevelName().startsWith("AltarFilm-V2-")) return false;
        Path worldRoot = server.getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize();
        return Files.isRegularFile(worldRoot.resolve("altarfilm-owned.txt"));
    }

    @SubscribeEvent
    public static void register(RegisterCommandsEvent e) {
        e.getDispatcher().register(Commands.literal("altarfilm")
            .requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
            .then(Commands.literal("prepare").executes(c -> prepare(c.getSource())))
            .then(Commands.literal("start").executes(c -> action(c.getSource(), "start")))
            .then(Commands.literal("pause").executes(c -> action(c.getSource(), "pause")))
            .then(Commands.literal("resume").executes(c -> action(c.getSource(), "resume")))
            .then(Commands.literal("stop").executes(c -> action(c.getSource(), "stop")))
            .then(Commands.literal("release").executes(c -> action(c.getSource(), "release")))
            .then(Commands.literal("status").executes(c -> {
                c.getSource().sendSuccess(() -> Component.literal(status+" "+String.format("%.2f",playhead)+"s; "+placed+" blocks"),false);
                return 1;
            }))
            .then(Commands.literal("preview")
                .then(Commands.argument("time",DoubleArgumentType.doubleArg(0,FilmData.INSTANCE.duration))
                    .executes(c -> preview(c.getSource(),DoubleArgumentType.getDouble(c,"time"))))));
    }

    public static int prepare(CommandSourceStack source) {
        var server = source.getServer();
        if (!permitted(server)) return refuse(source);
        if (placed > 0 || Files.exists(server.getWorldPath(LevelResource.ROOT).resolve("altarfilm-progress.json"))) {
            source.sendFailure(Component.literal("World already contains a take. Create a new AltarFilm world for a fresh recording."));
            return 0;
        }
        FilmData.INSTANCE.resolveStates();
        playhead=0; placed=0; spawned=false; active=false; cameraEnabled=true; ready=true;
        clockNanos=System.nanoTime(); status="ready";
        LOG.info("ALTAR_FILM_READY events={}",FilmData.INSTANCE.events.length);
        return 1;
    }
    private static int refuse(CommandSourceStack s) {
        s.sendFailure(Component.literal("Director is restricted to newly created, marked AltarFilm worlds."));
        return 0;
    }
    public static int action(CommandSourceStack source, String command) {
        if (!permitted(source.getServer())) return refuse(source);
        switch(command) {
            case "start" -> {
                if(!ready || placed>0) return 0;
                active=true; cameraEnabled=true; status="recording"; previewEnd=-1;
            }
            case "resume" -> { if(!ready || playhead>=FilmData.INSTANCE.duration) return 0; active=true; cameraEnabled=true; status="recording"; }
            case "pause" -> { active=false; status="paused"; }
            case "stop" -> { active=false; status="stopped"; }
            case "release" -> { active=false; cameraEnabled=false; status="released"; }
            default -> { return 0; }
        }
        lastNanos=clockNanos=System.nanoTime();
        writeStatus(source.getServer());
        return 1;
    }

    public static int preview(CommandSourceStack source, double seconds) {
        if (!permitted(source.getServer()) || !source.getServer().getWorldData().getLevelName().contains("Rehearsal")) return refuse(source);
        if(seconds < playhead) return 0;
        FilmData.INSTANCE.resolveStates();
        ServerLevel level=source.getLevel();
        while(placed<FilmData.INSTANCE.events.length && FilmData.INSTANCE.events[placed][0]<=seconds) {
            double[] b=FilmData.INSTANCE.events[placed++];
            level.setBlock(FilmData.INSTANCE.position(b),FilmData.INSTANCE.state(b),2);
        }
        playhead=seconds; ready=true; cameraEnabled=true; active=false; status="preview";
        clockNanos=System.nanoTime();
        reveal(source.getServer());
        writeStatus(source.getServer());
        return 1;
    }

    @SubscribeEvent
    public static void tick(ServerTickEvent.Post event) {
        var server=event.getServer();
        if(!permitted(server)) return;
        if(controlDirectory==null) {
            Path worldRoot = server.getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize();
            controlDirectory=worldRoot.getParent().getParent().resolve("altarfilm-control");
        }
        if(++tick%5==0) poll(server);
        if(!active) {
            if(tick%20==0) writeStatus(server);
            return;
        }
        long now=System.nanoTime();
        double dt=lastNanos==0?.05:Math.clamp((now-lastNanos)/1e9,0,.15);
        lastNanos=now;
        double desired=Math.min(FilmData.INSTANCE.duration,playhead+dt);
        int n=0;
        var data=FilmData.INSTANCE;
        var level=server.overworld();
        while(placed<data.events.length && data.events[placed][0]<=desired && n<512) {
            double[] b=data.events[placed++];
            level.setBlock(data.position(b),data.state(b),2);
            n++;
        }
        // Never jump ahead of outstanding work: camera and construction slow together.
        if(placed<data.events.length && data.events[placed][0]<=desired) desired=Math.max(playhead,data.events[placed-1][0]);
        playhead=desired;
        clockNanos=now;
        for(int i=0;i<data.stages.length;i++) {
            if(playhead>=data.stages[i].start() && playhead<data.stages[i].end() && stage!=i) {
                stage=i; LOG.info("ALTAR_FILM_STAGE {} blocks={}",data.stages[i].name(),placed);
            }
        }
        reveal(server);
        if(playhead>=data.duration) {
            active=false;status="complete";
            int mismatches=0;
            for(double[] b:data.events) if(!level.getBlockState(data.position(b)).equals(data.state(b))) mismatches++;
            LOG.info("ALTAR_FILM_COMPLETE placed={} mismatches={}",placed,mismatches);
            if(mismatches>0) status="geometry_mismatch";
            var finalPose=data.pose(data.duration);
            for(var player:server.getPlayerList().getPlayers())
                player.teleportTo(level,finalPose.position().x,finalPose.position().y,finalPose.position().z,Set.of(),finalPose.yaw(),finalPose.pitch(),false);
            server.saveEverything(true,false,true);
        }
        if(previewEnd>=0 && playhead>=previewEnd) {active=false;status="preview_complete";previewEnd=-1;}
        if(tick%20==0 || !active) writeStatus(server);
    }
    private static void reveal(MinecraftServer server) {
        if(playhead>=FilmData.INSTANCE.revealTime && !spawned) {
            server.getCommands().performPrefixedCommand(server.createCommandSourceStack(),FilmData.INSTANCE.blackHoleCommand);
            spawned=true;
        }
    }
    private static void poll(MinecraftServer server) {
        try {
            if(controlDirectory==null) return;
            Path file=controlDirectory.resolve("command.txt");
            if(!Files.exists(file)) return;
            String command=Files.readString(file).trim();
            Files.move(file,controlDirectory.resolve("last-command.txt"),StandardCopyOption.REPLACE_EXISTING);
            var source=server.createCommandSourceStack();
            if(command.startsWith("preview ")) preview(source,Double.parseDouble(command.substring(8)));
            else if(command.startsWith("rehearse ")) {
                if(!server.getWorldData().getLevelName().contains("Rehearsal")) return;
                double at=Double.parseDouble(command.substring(9));
                preview(source,at); action(source,"resume"); previewEnd=at+12;
            } else if(command.equals("save")) { server.saveEverything(true,false,true); writeStatus(server); }
            else if(command.equals("quit")) ClientDirector.requestQuit=true;
            else if(command.startsWith("world ")) ClientDirector.nextWorld=command.substring(6);
            else action(source,command);
        } catch(Exception e) {LOG.error("Director control failure",e);}
    }
    public static void resetSession() {
        active=false;cameraEnabled=false;ready=false;playhead=0;placed=0;stage=-1;spawned=false;
        controlDirectory=null;lastNanos=0;tick=0;status="idle";
    }
    public static double renderTime() {
        if(!active) return playhead;
        return Math.min(FilmData.INSTANCE.duration,Math.max(0,playhead-.05+Math.min(.05,(System.nanoTime()-clockNanos)/1e9)));
    }
    private static void writeStatus(MinecraftServer server) {
        try {
            if(controlDirectory==null) return;
            Files.createDirectories(controlDirectory);
            String json=new Gson().toJson(Map.of("status",status,"playhead",playhead,"placed",placed,
                "total",FilmData.INSTANCE.events.length,"world",server.getWorldData().getLevelName(),
                "camera",cameraEnabled,"updated",System.currentTimeMillis()));
            Path tmp=controlDirectory.resolve("status.tmp");
            Files.writeString(tmp,json);
            Files.move(tmp,controlDirectory.resolve("status.json"),StandardCopyOption.REPLACE_EXISTING);
            if(placed>0) Files.writeString(server.getWorldPath(LevelResource.ROOT).resolve("altarfilm-progress.json"),json);
        } catch(Exception e) {LOG.warn("Cannot write production status",e);}
    }
}
