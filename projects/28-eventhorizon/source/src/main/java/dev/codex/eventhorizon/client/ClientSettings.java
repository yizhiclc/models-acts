package dev.codex.eventhorizon.client;

import dev.codex.eventhorizon.EventHorizon;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;
import net.neoforged.fml.loading.FMLPaths;

public final class ClientSettings {
    public static boolean enabled = true;
    public static boolean highQuality = true;
    private static final Path FILE = FMLPaths.CONFIGDIR.get().resolve("eventhorizon-client.properties");

    private ClientSettings() {}

    public static void load() {
        if (!Files.exists(FILE)) return;
        try (Reader reader = Files.newBufferedReader(FILE)) {
            Properties properties = new Properties();
            properties.load(reader);
            enabled = Boolean.parseBoolean(properties.getProperty("enabled", "true"));
            highQuality = !properties.getProperty("quality", "high").equals("balanced");
        } catch (IOException e) { EventHorizon.LOGGER.warn("Could not read black hole settings", e); }
    }

    public static void save() {
        Properties properties = new Properties();
        properties.setProperty("enabled", Boolean.toString(enabled));
        properties.setProperty("quality", highQuality ? "high" : "balanced");
        try (Writer writer = Files.newBufferedWriter(FILE)) {
            properties.store(writer, "Event Horizon client lensing. Does not change entities or world data.");
        } catch (IOException e) { EventHorizon.LOGGER.warn("Could not save black hole settings", e); }
    }
}
