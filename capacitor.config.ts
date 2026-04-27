import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.yfiten.phone",
  appName: "Yfiten",
  webDir: "www",
  server: {
    androidScheme: "https",
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    GoogleAuth: {
      scopes: ["profile", "email"],
      clientId: "797674866519-jr95lc66v7s0s13a3pt5vvdiamq631uu.apps.googleusercontent.com",
      serverClientId: "797674866519-jr95lc66v7s0s13a3pt5vvdiamq631uu.apps.googleusercontent.com",
      androidClientId: "797674866519-jr95lc66v7s0s13a3pt5vvdiamq631uu.apps.googleusercontent.com",
      forceCodeForRefreshToken: false,
    },
  },
};

export default config;
