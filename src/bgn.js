// BackgroundServiceSDK.js
import { Alert, Platform, AppState } from 'react-native';
import * as ExpoNotifications from 'expo-notifications';
import * as Device from 'expo-device';
import BackgroundService from 'react-native-background-actions';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

// Check if we're in Expo or React Native CLI
const isExpo = !!(globalThis).Expo;

// Define background task names 
const BACKGROUND_TASK_NAME = 'BACKGROUND_SERVICE_TASK';
const BACKGROUND_FETCH_TASK = 'BACKGROUND_FETCH_TASK';

// Notification handler - kept outside as requested
ExpoNotifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Define task for Expo
if (isExpo) {
  TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
    try {
      const isRunning = await backgroundServiceSDK.isRunning();
      if (isRunning) {
        await backgroundServiceSDK.executeBackgroundTask();
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }
      return BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (error) {
      console.error('Background fetch error:', error);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

class BackgroundServiceSDK {
  constructor() {
    this.isInitialized = false;
    this.isRunning = false;
    this.notificationId = 1;
    this.persistentNotificationId = 999;
    this.task = null;
    this.taskOptions = null;
    this.executionInterval = null;
    this.lastExecutionTime = null;
    this.backgroundTaskRunning = false;
    this.appState = AppState.currentState;
    
    // Store callbacks
    this.callbacks = {
      onNotification: null,
      onNotificationResponse: null,
      onError: null,
      onTaskStart: null,
      onTaskStop: null,
      onTaskProgress: null,
      onAppStateChange: null,
    };
    
    // Store the last persistent notification
    this.lastPersistentNotification = null;
    this.lastPersistentNotificationData = null;
    
    // Track execution count
    this.executionCount = 0;
    
    // Setup app state listener for background/foreground detection
    this.setupAppStateListener();
    
    if (isExpo) {
      this.setupExpoNotifications();
      this.setupExpoBackgroundFetch();
    } else {
      this.setupRNPushNotification();
    }
  }

  /**
   * Setup app state listener
   */
  setupAppStateListener() {
    AppState.addEventListener('change', (nextAppState) => {
      const prevAppState = this.appState;
      this.appState = nextAppState;
      
      if (this.callbacks.onAppStateChange) {
        this.callbacks.onAppStateChange(nextAppState, prevAppState);
      }
      
      console.log('App state changed:', prevAppState, '->', nextAppState);
      
      // Handle background/foreground transitions
      if (nextAppState === 'background' && this.isRunning) {
        this.onAppBackground();
      } else if (nextAppState === 'active' && this.isRunning) {
        this.onAppForeground();
      }
    });
  }

  /**
   * Called when app goes to background
   */
  onAppBackground() {
    console.log('App went to background, service is running');
    this.updatePersistentNotification(
      '🔄 Service Running',
      `App is in background - ${this.getUptime()}`
    );
  }

  /**
   * Called when app comes to foreground
   */
  onAppForeground() {
    console.log('App came to foreground');
    this.updatePersistentNotification(
      '🟢 Service Active',
      `App is in foreground - ${this.getUptime()}`
    );
  }

  /**
   * Get service uptime
   */
  getUptime() {
    if (!this.lastExecutionTime) return '0s';
    const diff = Date.now() - this.lastExecutionTime;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Setup Expo notifications
   */
  setupExpoNotifications() {
    // Listen for notifications
    this.notificationListener = ExpoNotifications.addNotificationReceivedListener(
      (notification) => {
        if (this.callbacks.onNotification) {
          this.callbacks.onNotification(notification);
        }
      }
    );

    this.responseListener = ExpoNotifications.addNotificationResponseReceivedListener(
      (response) => {
        if (this.callbacks.onNotificationResponse) {
          this.callbacks.onNotificationResponse(response);
        }
        this.handleNotificationAction(response);
      }
    );
  }

  /**
   * Setup Expo background fetch
   */
  async setupExpoBackgroundFetch() {
    try {
      const status = await BackgroundFetch.getStatusAsync();
      if (status === BackgroundFetch.BackgroundFetchStatus.Available) {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
          minimumInterval: 15 * 60, // 15 minutes minimum
          stopOnTerminate: false,
          startOnBoot: true,
        });
        console.log('Background fetch registered');
      }
    } catch (error) {
      console.error('Background fetch setup error:', error);
    }
  }

  /**
   * Setup react-native-push-notification
   */
  setupRNPushNotification() {
    // This would be the setup for react-native-push-notification
    console.log('RN Push Notification setup');
  }

  /**
   * Initialize the SDK
   */
  async initialize(callbacks = {}) {
    this.callbacks = { ...this.callbacks, ...callbacks };
    this.isInitialized = true;

    if (isExpo) {
      await this.requestExpoPermissions();
    }

    // Check if service was already running
    if (isExpo) {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
      if (isRegistered) {
        console.log('Background task already registered');
      }
    } else {
      this.isRunning = BackgroundService.isRunning();
    }

    console.log('SDK Initialized');
    return this;
  }

  /**
   * Request notification permissions
   */
  async requestNotificationPermissions() {
    try {
      if (!isExpo) {
        // For React Native CLI with react-native-push-notification
        if (Platform.OS === 'android') {
          console.log('Android notification permissions are configured in manifest');
          return true;
        }
        
        // iOS - request permissions using react-native-push-notification
        console.log('Requesting iOS notification permissions');
        return true;
      }

      // Expo implementation
      if (!Device.isDevice) {
        console.log('Not a device, skipping permissions');
        return false;
      }

      let { status } = await ExpoNotifications.getPermissionsAsync();
      
      if (status !== 'granted') {
        const result = await ExpoNotifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
            allowAnnouncements: true,
          },
        });
        status = result.status;
      }

      const granted = status === 'granted';
      
      if (!granted) {
        Alert.alert(
          'Permission Required',
          'Please enable notifications to receive alerts and updates from the app.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => this.openAppSettings() },
          ]
        );
      } else {
        // Setup Android channels
        if (Platform.OS === 'android') {
          await this.setupAndroidNotificationChannels();
        }
      }

      return granted;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  /**
   * Request background permissions
   */
  async requestBackgroundPermissions() {
    try {
      if (!isExpo) {
        // React Native CLI with react-native-background-actions
        // The permissions are handled in the manifest
        console.log('Background permissions configured in app manifest');
        
        // For Android, check if we have the necessary permissions
        if (Platform.OS === 'android') {
          console.log('Android background permissions are configured in AndroidManifest.xml');
          return true;
        }
        
        // For iOS, Background Tasks capability needs to be enabled
        if (Platform.OS === 'ios') {
          console.log('iOS background permissions require Background Modes capability');
          // You might want to check if background refresh is enabled
        }
        return true;
      }

      // Expo implementation
      let permissionsGranted = true;
      
      // Check background fetch permissions
      const status = await BackgroundFetch.getStatusAsync();
      
      if (status === BackgroundFetch.BackgroundFetchStatus.Denied) {
        Alert.alert(
          'Background Permission Required',
          'Please enable background app refresh to run tasks in the background.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => this.openAppSettings() },
          ]
        );
        permissionsGranted = false;
      } else if (status === BackgroundFetch.BackgroundFetchStatus.Restricted) {
        Alert.alert(
          'Background Permissions Restricted',
          'Background permissions are restricted on this device.',
          [{ text: 'OK' }]
        );
        permissionsGranted = false;
      }

      // Register background task if permissions are available
      if (permissionsGranted) {
        try {
          await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
            minimumInterval: 15 * 60,
            stopOnTerminate: false,
            startOnBoot: true,
          });
          console.log('Background task registered successfully');
        } catch (error) {
          console.error('Error registering background task:', error);
          permissionsGranted = false;
        }
      }

      return permissionsGranted;
    } catch (error) {
      console.error('Error requesting background permissions:', error);
      return false;
    }
  }

  /**
   * Request all permissions (notification and background)
   */
  async requestAllPermissions() {
    const notificationGranted = await this.requestNotificationPermissions();
    const backgroundGranted = await this.requestBackgroundPermissions();
    
    return {
      notification: notificationGranted,
      background: backgroundGranted,
      allGranted: notificationGranted && backgroundGranted,
    };
  }

  /**
   * Open app settings
   */
  openAppSettings() {
    try {
      if (Platform.OS === 'ios') {
        // For iOS, use Linking API
        const { Linking } = require('react-native');
        Linking.openURL('app-settings:');
      } else if (Platform.OS === 'android') {
        const { Linking } = require('react-native');
        Linking.openSettings();
      }
    } catch (error) {
      console.error('Error opening settings:', error);
    }
  }

  /**
   * Setup Android notification channels
   */
  async setupAndroidNotificationChannels() {
    try {
      await ExpoNotifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: ExpoNotifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        lockscreenVisibility: ExpoNotifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        enableLights: true,
        lightColor: '#2196F3',
      });

      await ExpoNotifications.setNotificationChannelAsync('persistent', {
        name: 'Persistent',
        importance: ExpoNotifications.AndroidImportance.MAX,
        vibrationPattern: [],
        enableVibrate: false,
        lockscreenVisibility: ExpoNotifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        enableLights: false,
      });

      await ExpoNotifications.setNotificationChannelAsync('alert', {
        name: 'Alert',
        importance: ExpoNotifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        lockscreenVisibility: ExpoNotifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        enableLights: true,
        lightColor: '#FF0000',
      });

      await ExpoNotifications.setNotificationChannelAsync('silent', {
        name: 'Silent',
        importance: ExpoNotifications.AndroidImportance.LOW,
        vibrationPattern: [],
        enableVibrate: false,
        lockscreenVisibility: ExpoNotifications.AndroidNotificationVisibility.PRIVATE,
        enableLights: false,
      });

      console.log('Android notification channels configured');
    } catch (error) {
      console.error('Error setting up Android notification channels:', error);
    }
  }

  /**
   * Request permissions for Expo
   */
  async requestExpoPermissions() {
    if (!Device.isDevice) {
      console.log('Not a device, skipping permissions');
      return false;
    }

    let { status } = await ExpoNotifications.getPermissionsAsync();
    
    if (status !== 'granted') {
      const result = await ExpoNotifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowAnnouncements: true,
        },
      });
      status = result.status;
    }

    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please enable notifications');
      return false;
    }

    // Setup Android channels
    if (Platform.OS === 'android') {
      await this.setupAndroidNotificationChannels();
    }

    return true;
  }

  /**
   * Define and start background task
   * @param {Function} taskFunction - The task to run in background
   * @param {Object} options - Background task options
   */
  async startBackgroundTask(taskFunction, options = {}) {
    if (!this.isInitialized) {
      throw new Error('SDK not initialized. Call initialize() first.');
    }

    const defaultOptions = {
      taskName: 'BackgroundService',
      taskTitle: 'Service Running',
      taskDesc: 'Background service is active',
      taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
      },
      color: '#2196F3',
      linkingURI: 'yourapp://background',
      progressBar: {
        max: 100,
        value: 0,
        indeterminate: false,
      },
      stopWithApp: false,
      disableAutoStart: false,
      isSilent: false,
      autoRestart: true,
      ...options,
    };

    // Create the background task wrapper
    const backgroundTask = async (taskData) => {
      try {
        this.backgroundTaskRunning = true;
        this.lastExecutionTime = Date.now();
        this.executionCount++;

        if (this.callbacks.onTaskStart) {
          this.callbacks.onTaskStart(taskData);
        }

        // Execute the user's task
        await taskFunction(taskData);

        // Update progress notification
        if (taskData.progress !== undefined) {
          this.updateProgressNotification(
            taskData.progress,
            options.taskTitle || 'Processing',
            options.taskDesc || 'Please wait...'
          );
        }

        if (this.callbacks.onTaskProgress) {
          this.callbacks.onTaskProgress(taskData);
        }

        // Update persistent notification
        this.updatePersistentNotification(
          `🔄 ${options.taskTitle}`,
          `Running for ${this.getUptime()} | Executions: ${this.executionCount}`,
          {
            progress: this.executionCount,
            uptime: this.getUptime(),
          }
        );

        this.backgroundTaskRunning = false;
      } catch (error) {
        console.error('Background task error:', error);
        this.backgroundTaskRunning = false;
        if (this.callbacks.onError) {
          this.callbacks.onError(error);
        }
        throw error;
      }
    };

    if (!isExpo) {
      // React Native CLI - use react-native-background-actions
      const taskOptions = {
        taskName: defaultOptions.taskName,
        taskTitle: defaultOptions.taskTitle,
        taskDesc: defaultOptions.taskDesc,
        taskIcon: defaultOptions.taskIcon,
        color: defaultOptions.color,
        linkingURI: defaultOptions.linkingURI,
        parameters: {
          delay: options.interval || 10000,
        },
        isSilent: defaultOptions.isSilent,
        autoRestart: defaultOptions.autoRestart,
        stopWithApp: defaultOptions.stopWithApp,
        disableAutoStart: defaultOptions.disableAutoStart,
        ...options,
      };

      this.task = backgroundTask;
      this.taskOptions = taskOptions;
      
      await BackgroundService.start(backgroundTask, taskOptions);
      this.isRunning = true;
      
      // Show persistent notification
      this.showPersistentNotification(
        `🟢 ${defaultOptions.taskTitle}`,
        `Service started - ${this.getUptime()}`,
        {
          data: { 
            serviceId: 'background-service',
            startTime: Date.now(),
          },
          actions: [
            { identifier: 'STOP', title: 'Stop' },
            { identifier: 'STATUS', title: 'Status' },
          ],
        }
      );
    } else {
      // Expo - use BackgroundFetch and TaskManager
      // Register the task
      TaskManager.defineTask(BACKGROUND_TASK_NAME, async ({ data, error }) => {
        if (error) {
          console.error('Task error:', error);
          return;
        }
        
        try {
          await backgroundTask(data || {});
        } catch (err) {
          console.error('Background task execution error:', err);
        }
      });

      // Register the task with a minimum interval
      await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK_NAME, {
        minimumInterval: options.interval ? options.interval / 1000 : 60, // in seconds
        stopOnTerminate: false,
        startOnBoot: true,
      });

      this.isRunning = true;
      
      // Show persistent notification for Expo (mimicking)
      this.showPersistentNotification(
        `🟢 ${defaultOptions.taskTitle}`,
        `Service started (Expo) - ${this.getUptime()}`,
        {
          data: { 
            serviceId: 'background-service-expo',
            startTime: Date.now(),
          },
        }
      );
    }

    console.log('Background task started');
    return true;
  }

  /**
   * Execute background task (called by Expo's background fetch)
   */
  async executeBackgroundTask() {
    if (this.backgroundTaskRunning) return;
    
    try {
      this.backgroundTaskRunning = true;
      this.lastExecutionTime = Date.now();
      this.executionCount++;

      // Execute the task if defined
      if (this.task) {
        await this.task({ executionCount: this.executionCount });
      }

      this.backgroundTaskRunning = false;
    } catch (error) {
      console.error('Background task execution error:', error);
      this.backgroundTaskRunning = false;
    }
  }

  /**
   * Stop the background task
   */
  async stopBackgroundTask() {
    try {
      if (!isExpo) {
        await BackgroundService.stop();
      } else {
        await BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK_NAME);
        await TaskManager.unregisterAllTasksAsync();
      }
      
      this.isRunning = false;
      this.backgroundTaskRunning = false;
      
      // Remove persistent notification
      this.removePersistentNotification();
      
      // Show stopped notification
      this.showNotification(
        '⏹️ Service Stopped',
        'Background service has been stopped',
        {
          data: { 
            stoppedAt: Date.now(),
            totalExecutions: this.executionCount,
          },
        }
      );
      
      if (this.callbacks.onTaskStop) {
        this.callbacks.onTaskStop();
      }
      
      console.log('Background task stopped');
      return true;
    } catch (error) {
      console.error('Stop background task error:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      return false;
    }
  }

  /**
   * Show a regular notification
   */
  async showNotification(title, body, options = {}) {
    try {
      const notificationContent = {
        title,
        body,
        sound: options.sound || 'default',
        badge: options.badge !== undefined ? options.badge : 1,
        data: options.data || {},
        ...this.getPlatformSpecificNotification(options),
      };

      if (isExpo) {
        return await ExpoNotifications.scheduleNotificationAsync({
          content: notificationContent,
          trigger: options.trigger || null,
        });
      } else {
        // RN Push Notification implementation
        console.log('RN Push Notification:', { title, body, options });
        return this.notificationId++;
      }
    } catch (error) {
      console.error('Show notification error:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      return null;
    }
  }

  /**
   * Show a persistent notification (cannot be swiped away)
   */
  async showPersistentNotification(title, body, options = {}) {
    try {
      const notificationContent = {
        title,
        body,
        sound: options.sound || 'default',
        data: {
          type: 'persistent',
          persistentId: this.persistentNotificationId,
          ...(options.data || {}),
        },
        badge: options.badge || 1,
        ...this.getPlatformSpecificNotification({
          ...options,
          persistent: true,
        }),
      };

      let notificationId;

      if (isExpo) {
        // Cancel previous persistent notification
        if (this.lastPersistentNotification) {
          await ExpoNotifications.cancelScheduledNotificationAsync(
            this.lastPersistentNotification
          );
        }

        const result = await ExpoNotifications.scheduleNotificationAsync({
          content: notificationContent,
          trigger: options.trigger || null,
        });
        
        this.lastPersistentNotification = result;
        notificationId = result;
        this.lastPersistentNotificationData = {
          title,
          body,
          options,
        };
      } else {
        // RN Push Notification with ongoing flag
        notificationId = this.persistentNotificationId;
        console.log('RN Persistent Notification:', { title, body, options });
      }

      return notificationId;
    } catch (error) {
      console.error('Show persistent notification error:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      return null;
    }
  }

  /**
   * Update persistent notification
   */
  async updatePersistentNotification(title, body, options = {}) {
    if (this.lastPersistentNotification) {
      await this.showPersistentNotification(title, body, options);
    } else {
      await this.showPersistentNotification(title, body, options);
    }
  }

  /**
   * Update progress notification
   */
  async updateProgressNotification(progress, title = 'Processing', message = 'Please wait...') {
    const progressBar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
    
    return this.updatePersistentNotification(
      title,
      `${message}\n${progressBar} ${progress}%`,
      {
        data: { progress },
        progress: {
          max: 100,
          current: progress,
          indeterminate: false,
        },
      }
    );
  }

  /**
   * Send custom notification with full configuration
   */
  async sendCustomNotification(title, body, options = {}) {
    try {
      const {
        data = {},
        sound = 'default',
        priority = 'high',
        badge = 1,
        subtitle = null,
        categoryIdentifier = null,
        threadIdentifier = null,
        autoDismiss = true,
        color = null,
        icon = null,
        groupId = null,
        groupSummary = false,
        actions = [],
        interruptionLevel = 'active',
        channelId = 'default',
        vibrate = true,
        ongoing = false,
      } = options;

      const notificationContent = {
        title,
        body,
        sound,
        badge,
        data: {
          ...data,
          custom: true,
          timestamp: Date.now(),
        },
        subtitle,
        categoryIdentifier,
        threadIdentifier,
      };

      // Platform-specific configurations
      if (Platform.OS === 'android') {
        notificationContent.android = {
          channelId: channelId || 'default',
          priority: this.getAndroidPriority(priority),
          color: color || undefined,
          icon: icon || undefined,
          autoDismiss,
          ongoing,
          ...(groupId && { groupId }),
          ...(groupSummary && { groupSummary }),
          ...(vibrate && { vibrate: true }),
          ...(actions.length > 0 && {
            actions: actions.map(action => ({
              buttonId: action.identifier || action.id,
              title: action.title || action.label,
              pressAction: {
                id: action.identifier || action.id,
              },
            })),
          }),
        };
      }

      if (Platform.OS === 'ios') {
        notificationContent.ios = {
          sound,
          badge,
          subtitle,
          categoryIdentifier: categoryIdentifier || 'custom',
          threadIdentifier,
          interruptionLevel: interruptionLevel || 'active',
          ...(actions.length > 0 && {
            categoryIdentifier: categoryIdentifier || 'custom',
            actions: actions.map(action => ({
              identifier: action.identifier || action.id,
              title: action.title || action.label,
              options: {
                ...(action.foreground && { foreground: true }),
                ...(action.destructive && { destructive: true }),
                ...(action.authenticationRequired && {
                  authenticationRequired: true,
                }),
              },
            })),
          }),
        };
      }

      let notificationId;

      if (isExpo) {
        const result = await ExpoNotifications.scheduleNotificationAsync({
          content: notificationContent,
          trigger: options.trigger || null,
        });
        notificationId = result;
      } else {
        notificationId = this.notificationId++;
        console.log('RN Custom Notification:', { title, body, options });
      }

      return notificationId;
    } catch (error) {
      console.error('Send custom notification error:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      return null;
    }
  }

  /**
   * Show alert notification (high priority)
   */
  async showAlertNotification(title, body, options = {}) {
    return this.sendCustomNotification(title, body, {
      ...options,
      priority: 'max',
      channelId: 'alert',
      vibrate: true,
      sound: 'default',
      interruptionLevel: 'critical',
    });
  }

  /**
   * Show silent notification
   */
  async showSilentNotification(title, body, options = {}) {
    return this.sendCustomNotification(title, body, {
      ...options,
      priority: 'low',
      channelId: 'silent',
      sound: null,
      vibrate: false,
      badge: 0,
    });
  }

  /**
   * Schedule notification for later
   */
  async scheduleNotification(title, body, delayMs = 60000, options = {}) {
    const trigger = {
      seconds: delayMs / 1000,
    };

    return this.showNotification(title, body, {
      ...options,
      trigger,
    });
  }

  /**
   * Cancel a specific notification
   */
  async cancelNotification(notificationId) {
    try {
      if (isExpo) {
        await ExpoNotifications.cancelScheduledNotificationAsync(notificationId);
        await ExpoNotifications.dismissNotificationAsync(notificationId);
      } else {
        console.log('Cancel notification:', notificationId);
      }
      return true;
    } catch (error) {
      console.error('Cancel notification error:', error);
      return false;
    }
  }

  /**
   * Cancel all notifications
   */
  async cancelAllNotifications() {
    try {
      if (isExpo) {
        await ExpoNotifications.dismissAllNotificationsAsync();
        await ExpoNotifications.cancelAllScheduledNotificationsAsync();
      } else {
        console.log('Cancel all notifications');
      }
      this.lastPersistentNotification = null;
      return true;
    } catch (error) {
      console.error('Cancel all notifications error:', error);
      return false;
    }
  }

  /**
   * Remove persistent notification
   */
  async removePersistentNotification() {
    if (this.lastPersistentNotification) {
      await this.cancelNotification(this.lastPersistentNotification);
      this.lastPersistentNotification = null;
      this.lastPersistentNotificationData = null;
    }
  }

  /**
   * Handle notification actions
   */
  handleNotificationAction(response) {
    const action = response.actionIdentifier;
    const data = response.notification.request.content.data;

    if (action === 'STOP' || action === 'CANCEL') {
      this.stopBackgroundTask();
    } else if (action === 'STATUS') {
      this.showStatusNotification();
    }

    if (this.callbacks.onNotificationResponse) {
      this.callbacks.onNotificationResponse(response);
    }
  }

  /**
   * Show status notification
   */
  async showStatusNotification() {
    const status = this.getStatus();
    await this.showNotification(
      '📊 Service Status',
      `Running: ${status.isRunning}\nExecutions: ${status.executionCount}\nUptime: ${status.uptime || 'N/A'}\nPlatform: ${status.platform}`,
      {
        data: status,
        badge: 1,
      }
    );
  }

  /**
   * Get platform-specific notification options
   */
  getPlatformSpecificNotification(options = {}) {
    const { persistent = false, priority = 'high', actions = [] } = options;

    const config = {};

    if (Platform.OS === 'android') {
      config.android = {
        channelId: persistent ? 'persistent' : 'default',
        priority: this.getAndroidPriority(priority),
        ...(persistent && {
          ongoing: true,
          autoDismiss: false,
          sticky: true,
        }),
        ...(actions.length > 0 && {
          actions: actions.map(action => ({
            buttonId: action.identifier || action.id,
            title: action.title || action.label,
            pressAction: {
              id: action.identifier || action.id,
            },
          })),
        }),
      };
    }

    if (Platform.OS === 'ios') {
      config.ios = {
        sound: options.sound || 'default',
        badge: options.badge || 1,
        interruptionLevel: persistent ? 'critical' : 'active',
        ...(actions.length > 0 && {
          categoryIdentifier: 'custom',
          actions: actions.map(action => ({
            identifier: action.identifier || action.id,
            title: action.title || action.label,
            options: {
              foreground: true,
              ...(action.destructive && { destructive: true }),
            },
          })),
        }),
      };
    }

    return config;
  }

  /**
   * Map priority strings to Android constants
   */
  getAndroidPriority(priority) {
    if (isExpo) {
      const priorityMap = {
        max: ExpoNotifications.AndroidNotificationPriority.MAX,
        high: ExpoNotifications.AndroidNotificationPriority.HIGH,
        low: ExpoNotifications.AndroidNotificationPriority.LOW,
        min: ExpoNotifications.AndroidNotificationPriority.MIN,
        default: ExpoNotifications.AndroidNotificationPriority.DEFAULT,
      };
      return priorityMap[priority] || ExpoNotifications.AndroidNotificationPriority.DEFAULT;
    }
    return priority;
  }

  /**
   * Check if service is running
   */
  async isRunning() {
    if (!isExpo) {
      return this.isRunning || BackgroundService.isRunning();
    } else {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
      return this.isRunning || isRegistered;
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isInitialized: this.isInitialized,
      isExpo,
      platform: Platform.OS,
      executionCount: this.executionCount,
      uptime: this.getUptime(),
      lastExecutionTime: this.lastExecutionTime,
      hasPersistentNotification: !!this.lastPersistentNotification,
      appState: this.appState,
      backgroundTaskRunning: this.backgroundTaskRunning,
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.isRunning) {
      await this.stopBackgroundTask();
    }
    
    if (isExpo) {
      if (this.notificationListener) {
        ExpoNotifications.removeNotificationSubscription(this.notificationListener);
      }
      if (this.responseListener) {
        ExpoNotifications.removeNotificationSubscription(this.responseListener);
      }
      await TaskManager.unregisterAllTasksAsync();
    }
    
    this.cancelAllNotifications();
    this.isInitialized = false;
    this.isRunning = false;
    console.log('SDK Cleaned Up');
  }
}

// Create and export singleton
const backgroundServiceSDK = new BackgroundServiceSDK();
export default backgroundServiceSDK;