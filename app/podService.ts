import { signInAnonymously } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { auth, db } from './firebase';

// Ensure user is authenticated
export const ensureAuth = async () => {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  return auth.currentUser!.uid;
};

// Find or create a pod
export const findOrCreatePod = async (
  struggle: string,
  supportStyle: string,
  duration: string
): Promise<string> => {
  const userId = await ensureAuth();

  // First check if user is already in a pod
  const existingPod = await getUserPod();
  if (existingPod) {
    // User already in a pod, leave it first
    await leavePod(existingPod.id);
  }

  // Search for existing pods matching criteria
  const podsRef = collection(db, 'pods');
  const q = query(
    podsRef,
    where('struggle', '==', struggle),
    where('isActive', '==', true),
    where('memberCount', '<', 5),
    orderBy('memberCount', 'asc'),
    limit(1)
  );

  const snapshot = await getDocs(q);

  let podId: string;

  if (!snapshot.empty) {
    // Join existing pod
    const existingPod = snapshot.docs[0];
    podId = existingPod.id;

    // Check if not expired
    const podData = existingPod.data();
    if (isPodExpired(podData)) {
      // Pod expired, create new one instead
      podId = await createNewPod(struggle, supportStyle, duration, userId);
    } else {
      // Add member
      await addDoc(collection(db, `pods/${podId}/members`), {
        userId,
        joinedAt: serverTimestamp(),
      });

      // Increment member count
      await updateDoc(doc(db, 'pods', podId), {
        memberCount: increment(1),
      });

      // Add system message
      await addDoc(collection(db, `pods/${podId}/messages`), {
        type: 'system',
        text: 'Someone new joined the pod 👋',
        createdAt: serverTimestamp(),
      });
    }
  } else {
    // Create new pod
    podId = await createNewPod(struggle, supportStyle, duration, userId);
  }

  return podId;
};

// Create a new pod
const createNewPod = async (
  struggle: string,
  supportStyle: string,
  duration: string,
  userId: string
): Promise<string> => {
  const expiresAt = duration === '24h'
    ? Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
    : Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  // Create pod
  const podRef = await addDoc(collection(db, 'pods'), {
    struggle,
    supportStyle,
    duration,
    memberCount: 1,
    isActive: true,
    createdAt: serverTimestamp(),
    expiresAt,
  });

  // Add member
  await addDoc(collection(db, `pods/${podRef.id}/members`), {
    userId,
    joinedAt: serverTimestamp(),
  });

  // Add welcome message
  await addDoc(collection(db, `pods/${podRef.id}/messages`), {
    type: 'system',
    text: 'Welcome to your pod! 💙 Be kind and supportive.',
    createdAt: serverTimestamp(),
  });

  return podRef.id;
};

// Get user's current pod
export const getUserPod = async () => {
  try {
    const userId = await ensureAuth();

    // Search all pods for user's membership
    const podsSnapshot = await getDocs(collection(db, 'pods'));

    for (const podDoc of podsSnapshot.docs) {
      const membersRef = collection(db, `pods/${podDoc.id}/members`);
      const memberQuery = query(membersRef, where('userId', '==', userId));
      const memberSnapshot = await getDocs(memberQuery);

      if (!memberSnapshot.empty) {
        // User is a member of this pod
        const podData = podDoc.data();
        
        // Check if expired
        if (isPodExpired(podData)) {
          // Auto-leave expired pod
          await leavePod(podDoc.id);
          return null;
        }

        return {
          id: podDoc.id,
          ...podData,
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting user pod:', error);
    return null;
  }
};

// Leave a pod
export const leavePod = async (podId: string) => {
  try {
    const userId = await ensureAuth();

    // Find and delete member document
    const membersRef = collection(db, `pods/${podId}/members`);
    const memberQuery = query(membersRef, where('userId', '==', userId));
    const memberSnapshot = await getDocs(memberQuery);

    if (memberSnapshot.empty) {
      console.log('User not a member of this pod - skipping');
      return;
    }

    // Delete member document
    await deleteDoc(memberSnapshot.docs[0].ref);

    // Decrement member count
    const podRef = doc(db, 'pods', podId);
    const podDoc = await getDoc(podRef);
    
    if (podDoc.exists()) {
      const currentCount = podDoc.data().memberCount || 1;
      const newCount = Math.max(0, currentCount - 1); // Prevent negative
      
      await updateDoc(podRef, {
        memberCount: newCount,
        isActive: newCount > 0, // Deactivate if no members
      });

      // Add system message only if pod still has members
      if (newCount > 0) {
        await addDoc(collection(db, `pods/${podId}/messages`), {
          type: 'system',
          text: 'Someone left the pod 👋',
          createdAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    console.error('Error leaving pod:', error);
    throw error;
  }
};

// Subscribe to pod messages
export const subscribeToPodMessages = (
  podId: string,
  callback: (messages: any[]) => void
) => {
  const messagesRef = collection(db, `pods/${podId}/messages`);
  const q = query(messagesRef, orderBy('createdAt', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(messages);
  });
};

// Send a message
export const sendMessage = async (podId: string, text: string) => {
  const userId = await ensureAuth();
  await addDoc(collection(db, `pods/${podId}/messages`), {
    type: 'user',
    text,
    userId,
    createdAt: serverTimestamp(),
  });
};

// Check if pod is expired
export const isPodExpired = (pod: any): boolean => {
  if (!pod || !pod.expiresAt) return false;
  const now = new Date();
  const expiresAt = pod.expiresAt.toDate ? pod.expiresAt.toDate() : new Date(pod.expiresAt);
  return now > expiresAt;
};