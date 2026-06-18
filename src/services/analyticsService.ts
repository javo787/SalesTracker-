import analytics from '@react-native-firebase/analytics';

class AnalyticsService {
  private isEnabled = true;

  async logEvent(name: string, params?: object) {
    if (!this.isEnabled) return;
    try {
      await analytics().logEvent(name, params);
      console.log(`[Analytics] Event: ${name}`, params);
    } catch (e) {
      console.warn(`[Analytics] Failed to log event ${name}`, e);
    }
  }

  async logScreenView(screenName: string, screenClass?: string) {
    if (!this.isEnabled) return;
    try {
      await analytics().logScreenView({
        screen_name: screenName,
        screen_class: screenClass || screenName,
      });
      console.log(`[Analytics] ScreenView: ${screenName}`);
    } catch (e) {
      console.warn(`[Analytics] Failed to log screen view ${screenName}`, e);
    }
  }

  async setUserProperties(properties: object) {
    if (!this.isEnabled) return;
    try {
      // @react-native-firebase/analytics uses setUserProperties(object) but also has individual setUserProperty
      // Actually it's setUserProperties(properties: { [key: string]: string | null })
      await analytics().setUserProperties(properties as any);
    } catch (e) {
      console.warn('[Analytics] Failed to set user properties', e);
    }
  }

  async setUserId(id: string | null) {
    if (!this.isEnabled) return;
    try {
      await analytics().setUserId(id);
    } catch (e) {
      console.warn('[Analytics] Failed to set user ID', e);
    }
  }
}

export const analyticsService = new AnalyticsService();
