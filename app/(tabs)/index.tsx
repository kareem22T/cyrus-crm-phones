// App.js
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Contacts from 'expo-contacts';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const BACKEND_URL = 'https://your-backend-url.com/api'; // Replace with your backend URL
const STORAGE_KEYS = {
  CONTACTS_LAST_SYNC: 'contacts_last_sync',
  FOLDER_URI: 'folder_uri',
  FILES_LAST_SYNC: 'files_last_sync',
};

export default function App() {
  const [contactsPermission, setContactsPermission] = useState(null);
  const [selectedFolderUri, setSelectedFolderUri] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [syncStatus, setSyncStatus] = useState('');

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    setIsLoading(true);
    try {
      // Check existing permissions and stored data
      await checkContactsPermission();
      await loadStoredFolderUri();
      await loadLastSyncTime();
      
      // Auto-sync if permissions are granted and folder is selected
      if (contactsPermission === 'granted' && selectedFolderUri) {
        await performAutoSync();
      }
    } catch (error) {
      console.error('Initialization error:', error);
      Alert.alert('Initialization Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const checkContactsPermission = async () => {
    try {
      const { status } = await Contacts.getPermissionsAsync();
      setContactsPermission(status);
      return status;
    } catch (error) {
      console.error('Error checking contacts permission:', error);
      return 'denied';
    }
  };

  const requestContactsPermission = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      setContactsPermission(status);
      
      if (status === 'granted') {
        Alert.alert('Success', 'Contacts permission granted!');
        await syncContacts();
      } else {
        Alert.alert('Permission Denied', 'Contacts access is required for this app to work properly.');
      }
      
      return status;
    } catch (error) {
      console.error('Error requesting contacts permission:', error);
      Alert.alert('Error', 'Failed to request contacts permission');
      return 'denied';
    }
  };

  const selectFolder = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: false,
        multiple: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const folderUri = result.assets[0].uri;
        setSelectedFolderUri(folderUri);
        await AsyncStorage.setItem(STORAGE_KEYS.FOLDER_URI, folderUri);
        
        Alert.alert('Success', 'Folder access granted!');
        await syncFiles();
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
      Alert.alert('Error', 'Failed to select folder');
    }
  };

  const loadStoredFolderUri = async () => {
    try {
      const storedUri = await AsyncStorage.getItem(STORAGE_KEYS.FOLDER_URI);
      if (storedUri) {
        setSelectedFolderUri(storedUri);
      }
    } catch (error) {
      console.error('Error loading stored folder URI:', error);
    }
  };

  const loadLastSyncTime = async () => {
    try {
      const lastSync = await AsyncStorage.getItem(STORAGE_KEYS.CONTACTS_LAST_SYNC);
      if (lastSync) {
        setLastSyncTime(new Date(lastSync));
      }
    } catch (error) {
      console.error('Error loading last sync time:', error);
    }
  };

  const syncContacts = async () => {
    if (contactsPermission !== 'granted') {
      Alert.alert('Permission Required', 'Please grant contacts permission first.');
      return;
    }

    setIsLoading(true);
    setSyncStatus('Syncing contacts...');
    
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.ID,
        ],
      });

      setContacts(data);
      
      // Send contacts to backend
      await sendContactsToBackend(data);
      
      // Update last sync time
      const now = new Date().toISOString();
      await AsyncStorage.setItem(STORAGE_KEYS.CONTACTS_LAST_SYNC, now);
      setLastSyncTime(new Date(now));
      
      setSyncStatus('Contacts synced successfully!');
      setTimeout(() => setSyncStatus(''), 3000);
      
    } catch (error) {
      console.error('Error syncing contacts:', error);
      Alert.alert('Sync Error', 'Failed to sync contacts: ' + error.message);
      setSyncStatus('Contacts sync failed');
      setTimeout(() => setSyncStatus(''), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const syncFiles = async () => {
    if (!selectedFolderUri) {
      Alert.alert('Folder Required', 'Please select a folder first.');
      return;
    }

    setIsLoading(true);
    setSyncStatus('Syncing files...');
    
    try {
      // Get files from the selected directory
      const fileList = await getFilesFromDirectory(selectedFolderUri);
      setFiles(fileList);
      
      // Send files info to backend
      await sendFilesToBackend(fileList);
      
      // Update last sync time for files
      const now = new Date().toISOString();
      await AsyncStorage.setItem(STORAGE_KEYS.FILES_LAST_SYNC, now);
      
      setSyncStatus('Files synced successfully!');
      setTimeout(() => setSyncStatus(''), 3000);
      
    } catch (error) {
      console.error('Error syncing files:', error);
      Alert.alert('Sync Error', 'Failed to sync files: ' + error.message);
      setSyncStatus('Files sync failed');
      setTimeout(() => setSyncStatus(''), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const getFilesFromDirectory = async (directoryUri) => {
    try {
      // This is a simplified version - in a real app, you'd need to implement
      // proper file system traversal based on the selected folder
      const fileInfo = await FileSystem.getInfoAsync(directoryUri);
      
      if (fileInfo.exists) {
        return [{
          uri: directoryUri,
          name: directoryUri.split('/').pop(),
          size: fileInfo.size || 0,
          modificationTime: fileInfo.modificationTime || Date.now(),
        }];
      }
      
      return [];
    } catch (error) {
      console.error('Error getting files:', error);
      return [];
    }
  };

  const sendContactsToBackend = async (contactsData) => {
    try {
      const response = await fetch(`${BACKEND_URL}/sync-contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contacts: contactsData,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Contacts synced to backend:', result);
      
    } catch (error) {
      console.error('Backend sync error for contacts:', error);
      // Don't throw error - continue with local storage
      console.log('Continuing with local storage only');
    }
  };

  const sendFilesToBackend = async (filesData) => {
    try {
      const response = await fetch(`${BACKEND_URL}/sync-files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: filesData,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Files synced to backend:', result);
      
    } catch (error) {
      console.error('Backend sync error for files:', error);
      // Don't throw error - continue with local storage
      console.log('Continuing with local storage only');
    }
  };

  const performAutoSync = async () => {
    try {
      if (contactsPermission === 'granted') {
        await syncContacts();
      }
      
      if (selectedFolderUri) {
        await syncFiles();
      }
    } catch (error) {
      console.error('Auto sync error:', error);
    }
  };

  const performManualSync = async () => {
    setIsLoading(true);
    setSyncStatus('Manual sync in progress...');
    
    try {
      await performAutoSync();
      setSyncStatus('Manual sync completed!');
      setTimeout(() => setSyncStatus(''), 3000);
    } catch (error) {
      setSyncStatus('Manual sync failed');
      setTimeout(() => setSyncStatus(''), 3000);
      Alert.alert('Sync Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getPermissionStatus = (permission) => {
    switch (permission) {
      case 'granted':
        return { text: 'Granted', color: '#4CAF50', icon: 'checkmark-circle' };
      case 'denied':
        return { text: 'Denied', color: '#F44336', icon: 'close-circle' };
      default:
        return { text: 'Not Requested', color: '#FF9800', icon: 'help-circle' };
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Sync App</Text>
          <Text style={styles.subtitle}>Contacts & Files Synchronization</Text>
        </View>

        {/* Permissions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Permissions</Text>
          
          <View style={styles.permissionCard}>
            <View style={styles.permissionHeader}>
              <Ionicons 
                name="people" 
                size={24} 
                color="#2196F3" 
              />
              <Text style={styles.permissionTitle}>Contacts Access</Text>
            </View>
            
            <View style={styles.permissionStatus}>
              <Ionicons 
                name={getPermissionStatus(contactsPermission).icon} 
                size={20} 
                color={getPermissionStatus(contactsPermission).color} 
              />
              <Text style={[
                styles.statusText, 
                { color: getPermissionStatus(contactsPermission).color }
              ]}>
                {getPermissionStatus(contactsPermission).text}
              </Text>
            </View>
            
            {contactsPermission !== 'granted' && (
              <TouchableOpacity 
                style={styles.permissionButton} 
                onPress={requestContactsPermission}
                disabled={isLoading}
              >
                <Text style={styles.buttonText}>Grant Permission</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.permissionCard}>
            <View style={styles.permissionHeader}>
              <Ionicons 
                name="folder" 
                size={24} 
                color="#FF9800" 
              />
              <Text style={styles.permissionTitle}>Folder Access</Text>
            </View>
            
            <View style={styles.permissionStatus}>
              <Ionicons 
                name={selectedFolderUri ? "checkmark-circle" : "close-circle"} 
                size={20} 
                color={selectedFolderUri ? "#4CAF50" : "#F44336"} 
              />
              <Text style={[
                styles.statusText, 
                { color: selectedFolderUri ? "#4CAF50" : "#F44336" }
              ]}>
                {selectedFolderUri ? "Selected" : "Not Selected"}
              </Text>
            </View>
            
            <TouchableOpacity 
              style={styles.permissionButton} 
              onPress={selectFolder}
              disabled={isLoading}
            >
              <Text style={styles.buttonText}>
                {selectedFolderUri ? "Change Folder" : "Select Folder"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sync Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Synchronization</Text>
          
          <TouchableOpacity 
            style={[styles.syncButton, isLoading && styles.syncButtonDisabled]} 
            onPress={performManualSync}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="sync" size={24} color="#fff" />
            )}
            <Text style={styles.syncButtonText}>Manual Sync</Text>
          </TouchableOpacity>

          {syncStatus ? (
            <View style={styles.statusContainer}>
              <Text style={styles.syncStatus}>{syncStatus}</Text>
            </View>
          ) : null}

          {lastSyncTime && (
            <Text style={styles.lastSyncText}>
              Last sync: {lastSyncTime.toLocaleString()}
            </Text>
          )}
        </View>

        {/* Data Summary Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Summary</Text>
          
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Ionicons name="people" size={32} color="#2196F3" />
              <Text style={styles.summaryNumber}>{contacts.length}</Text>
              <Text style={styles.summaryLabel}>Contacts</Text>
            </View>
            
            <View style={styles.summaryCard}>
              <Ionicons name="document" size={32} color="#FF9800" />
              <Text style={styles.summaryNumber}>{files.length}</Text>
              <Text style={styles.summaryLabel}>Files</Text>
            </View>
          </View>
        </View>

        {/* Debug Information */}
        {__DEV__ && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Debug Info</Text>
            <Text style={styles.debugText}>
              Contacts Permission: {contactsPermission || 'null'}
            </Text>
            <Text style={styles.debugText}>
              Folder URI: {selectedFolderUri || 'Not selected'}
            </Text>
            <Text style={styles.debugText}>
              Backend URL: {BACKEND_URL}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
  },
  section: {
    backgroundColor: '#fff',
    margin: 10,
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  permissionCard: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
  },
  permissionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
    color: '#333',
  },
  permissionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  permissionButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  syncButton: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 15,
  },
  syncButtonDisabled: {
    backgroundColor: '#ccc',
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  statusContainer: {
    backgroundColor: '#e8f5e8',
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
  syncStatus: {
    color: '#2e7d32',
    fontSize: 14,
    textAlign: 'center',
  },
  lastSyncText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryCard: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 5,
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 10,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  debugText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 5,
    fontFamily: 'monospace',
  },
});