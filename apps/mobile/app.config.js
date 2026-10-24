/* global module, process */
/** Keep provider configuration outside Git; Expo merges this with app.json. */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    ...(process.env.DAYNORI_GOOGLE_SERVICES_FILE
      ? { googleServicesFile: process.env.DAYNORI_GOOGLE_SERVICES_FILE }
      : {}),
  },
  extra: {
    ...config.extra,
    ...(process.env.DAYNORI_EXPO_PROJECT_ID
      ? { eas: { ...config.extra?.eas, projectId: process.env.DAYNORI_EXPO_PROJECT_ID } }
      : {}),
  },
});
