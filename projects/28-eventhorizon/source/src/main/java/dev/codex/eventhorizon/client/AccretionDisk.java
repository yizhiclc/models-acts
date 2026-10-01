package dev.codex.eventhorizon.client;

public final class AccretionDisk {
    private AccretionDisk() {}

    // Co-rotating equatorial Kerr ISCO in units of GM/c^2.
    public static float innerRadius(float spin) {
        double a = Math.min(Math.abs(spin), 0.998);
        double z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
        double z2 = Math.sqrt(3 * a * a + z1 * z1);
        return (float) (3 + z2 - Math.sqrt((3 - z1) * (3 + z1 + 2 * z2)));
    }
}
