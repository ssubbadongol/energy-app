import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC49xk0IY6ER-NLetAgDu9Pk7cSsilKCPg",
  authDomain: "leedshack26.firebaseapp.com",
  projectId: "leedshack26",
  storageBucket: "leedshack26.firebasestorage.app",
  messagingSenderId: "314817464747",
  appId: "1:314817464747:web:d2940c5697afab3564aaee"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { ensureAuth } from './podService';

export const saveUserProfile = async (tags, name = null, goals = []) => {
  try {
    const userId = await ensureAuth();
    
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      // Create new profile
      await addDoc(usersRef, {
        userId,
        tags,
        name,
        goals,
        createdAt: serverTimestamp(),
      });
      console.log('User profile created');
    } else {
      // Update existing profile
      const docRef = snapshot.docs[0].ref;
      await updateDoc(docRef, {
        tags,
        name,
        goals,
        updatedAt: serverTimestamp(),
      });
      console.log('User profile updated');
    }
  } catch (error) {
    console.error('Error saving user profile:', error);
    throw error;
  }
};

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';

export const OnboardingScreen = ({ navigation }) => {
  const [selectedTags, setSelectedTags] = useState([]);
  
  const availableTags = [
    'ADHD',
    'Anxiety',
    'Depression',
    'Stress',
    'Focus Issues',
    'Sleep Problems',
    'Social Anxiety',
    'Overwhelm',
  ];
  
  const toggleTag = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };
  
  const handleContinue = async () => {
    if (selectedTags.length === 0) {
      Alert.alert('Please select at least one tag');
      return;
    }
    
    try {
      // Save profile
      await saveUserProfile(selectedTags);
      
      // Navigate to main app
      navigation.navigate('MainTabs');
    } catch (error) {
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    }
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>What brings you here?</Text>
      <Text style={styles.subtitle}>Select all that apply</Text>
      
      <View style={styles.tagsContainer}>
        {availableTags.map(tag => (
          <TouchableOpacity
            key={tag}
            style={[
              styles.tag,
              selectedTags.includes(tag) && styles.tagSelected
            ]}
            onPress={() => toggleTag(tag)}
          >
            <Text style={[
              styles.tagText,
              selectedTags.includes(tag) && styles.tagTextSelected
            ]}>
              {tag}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <TouchableOpacity
        style={[
          styles.button,
          selectedTags.length === 0 && styles.buttonDisabled
        ]}
        onPress={handleContinue}
        disabled={selectedTags.length === 0}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tag: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tagSelected: {
    backgroundColor: '#f3e8ff',
    borderColor: '#8b5cf6',
  },
  tagText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  tagTextSelected: {
    color: '#8b5cf6',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  buttonDisabled: {
    backgroundColor: '#d1d5db',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export const createADHDProfile = async () => {
  await saveUserProfile(['ADHD', 'Focus Issues'], 'User');
};

export const createAnxietyProfile = async () => {
  await saveUserProfile(['Anxiety', 'Stress']);
};

export const testUserProfile = async () => {
  const { getUserProfile } = await import('./aiMentorService');
  const profile = await getUserProfile();
  
  console.log('User Profile:', profile);
  console.log('Tags:', profile.tags);
  console.log('Name:', profile.name);
  
  if (profile.tags.length === 0) {
    console.warn('?? No tags found! User needs to complete onboarding.');
  } else {
    console.log('? Profile loaded successfully!');
  }
};