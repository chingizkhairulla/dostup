import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "kz.dostup.app",
  appName: "Dostup",
  webDir: "dist",
  android: {
    backgroundColor: "#000000",
  },
  ios: {
    backgroundColor: "#000000",
    contentInset: "automatic",
  },
};

export default config;
