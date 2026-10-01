package dev.codex.altarreview;

import com.google.gson.Gson;
import com.mojang.logging.LogUtils;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.GZIPInputStream;
import net.minecraft.commands.arguments.blocks.BlockStateParser;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.storage.LevelResource;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.event.tick.ServerTickEvent;
import org.slf4j.Logger;

@Mod(ReviewBuilder.ID)
@EventBusSubscriber(modid=ReviewBuilder.ID)
public final class ReviewBuilder {
    public static final String ID="altarreview";
    public static final String WORLD="AltarReview-V2-20260925";
    public static final Logger LOG=LogUtils.getLogger();
    public static volatile boolean built;
    private static boolean building;
    private static int placed;
    private static Blueprint blueprint;
    private static BlockState[] states;
    static final class Blueprint {
        String name;
        int revision;
        String[] palette;
        int[][] blocks;
        int[][] removeBlocks;
        String blackHoleCommand;
    }
    public static boolean permitted(MinecraftServer server) {
        return Boolean.getBoolean("altarreview.auto") && WORLD.equals(server.getWorldData().getLevelName());
    }
    public static void begin(MinecraftServer server) {
        if(!permitted(server)) throw new IllegalStateException("Wrong world; review builder is isolated.");
        Path marker=server.getWorldPath(LevelResource.ROOT).resolve("altarreview-complete.json");
        try(var stream=new GZIPInputStream(ReviewBuilder.class.getResourceAsStream("/altarreview/review.json.gz"))) {
            blueprint=new Gson().fromJson(new InputStreamReader(stream,StandardCharsets.UTF_8),Blueprint.class);
            if(Files.exists(marker)&&Files.readString(marker).contains("\"revision\":"+blueprint.revision+",")) {
                built=true;return;
            }
            states=new BlockState[blueprint.palette.length];
            for(int i=0;i<states.length;i++)
                states[i]=BlockStateParser.parseForBlock(BuiltInRegistries.BLOCK,blueprint.palette[i],false).blockState();
            if(blueprint.removeBlocks!=null) for(int[] b:blueprint.removeBlocks)
                server.overworld().setBlock(new BlockPos(b[0],b[1],b[2]),Blocks.AIR.defaultBlockState(),2);
            building=true;
            LOG.info("REVIEW_BUILD_START blocks={}",blueprint.blocks.length);
        } catch(Exception e) { throw new IllegalStateException(e); }
    }
    @SubscribeEvent
    public static void tick(ServerTickEvent.Post event) {
        if(!building || !permitted(event.getServer())) return;
        var level=event.getServer().overworld();
        int end=Math.min(placed+1400,blueprint.blocks.length);
        while(placed<end) {
            int[] b=blueprint.blocks[placed++];
            level.setBlock(new BlockPos(b[0],b[1],b[2]),states[b[3]],2);
        }
        if(placed==blueprint.blocks.length) {
            building=false;
            int mismatch=0;
            for(int[] b:blueprint.blocks) if(!level.getBlockState(new BlockPos(b[0],b[1],b[2])).equals(states[b[3]])) mismatch++;
            if(blueprint.removeBlocks!=null) for(int[] b:blueprint.removeBlocks)
                if(!level.getBlockState(new BlockPos(b[0],b[1],b[2])).isAir()) mismatch++;
            try {
                String status="{\"revision\":"+blueprint.revision+",\"reviewOnly\":true,\"filming\":false,\"blocks\":"+placed+",\"mismatches\":"+mismatch+"}";
                Files.writeString(event.getServer().getWorldPath(LevelResource.ROOT).resolve("altarreview-complete.json"),status);
                event.getServer().saveEverything(true,false,true);
                LOG.info("REVIEW_BUILD_COMPLETE blocks={} mismatches={}",placed,mismatch);
                built=true;
            } catch(Exception e) { LOG.error("Review save failed",e); }
        }
    }
}
