import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Priority = 'High' | 'Medium' | 'Low';

type Task = {
  id: string;
  text: string;
  completed: boolean;
  priority: Priority;
  notificationId?: string;
};

export default function App() {
  const [taskText, setTaskText] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [priority, setPriority] = useState<Priority>('Medium');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [recentlyDeletedTask, setRecentlyDeletedTask] = useState<Task | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission for notifications not granted.');
      }
    })();

    loadTasks();
  }, []);

  const loadTasks = async () => {
    const savedTasks = await AsyncStorage.getItem('tasks');
    if (savedTasks) {
      setTasks(JSON.parse(savedTasks));
    }
  };

  const saveTasks = async (tasksToSave: Task[]) => {
    await AsyncStorage.setItem('tasks', JSON.stringify(tasksToSave));
  };

  const scheduleNotification = async (task: Task) => {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Task Reminder',
          body: `Time to complete: ${task.text}`,
        },
        trigger: {
          seconds: 300,
          repeats: false,
        } as any,
      });
      return notificationId;
    } catch (error) {
      console.error('Error scheduling notification:', error);
    }
  };

  const addTask = async () => {
    if (!taskText.trim()) {
      alert('Task cannot be empty');
      return;
    }

    const newTask: Task = {
      id: Date.now().toString(),
      text: taskText,
      completed: false,
      priority,
    };

    const notificationId = await scheduleNotification(newTask);
    newTask.notificationId = notificationId;

    const updatedTasks = [newTask, ...tasks];
    setTasks(updatedTasks);
    saveTasks(updatedTasks);
    setTaskText('');
  };

  const toggleComplete = async (taskId: string) => {
    const updated = tasks.map(task => {
      if (task.id === taskId) {
        if (!task.completed && task.notificationId) {
          Notifications.cancelScheduledNotificationAsync(task.notificationId);
        }
        return {
          ...task,
          completed: !task.completed,
          notificationId: undefined,
        };
      }
      return task;
    });
    setTasks(updated);
    saveTasks(updated);
  };

  const deleteTask = async (taskId: string) => {
    const taskToDelete = tasks.find(t => t.id === taskId);
    if (!taskToDelete) return;

    if (taskToDelete.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(taskToDelete.notificationId);
    }

    const updated = tasks.filter(t => t.id !== taskId);
    setTasks(updated);
    saveTasks(updated);
    setRecentlyDeletedTask(taskToDelete);
    setUndoVisible(true);

    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setUndoVisible(false);
      setRecentlyDeletedTask(null);
    }, 5000);
  };

  const undoDelete = () => {
    if (!recentlyDeletedTask) return;
    const updatedTasks = [recentlyDeletedTask, ...tasks];
    setTasks(updatedTasks);
    saveTasks(updatedTasks);
    setUndoVisible(false);
    setRecentlyDeletedTask(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  };

  const editTask = (task: Task) => {
    setEditingTask(task);
    setTaskText(task.text);
    setPriority(task.priority);
    setModalVisible(true);
    inputRef.current?.focus();
  };

  const saveEditedTask = () => {
    if (!editingTask) return;

    const updated = tasks.map(t =>
      t.id === editingTask.id
        ? { ...t, text: taskText, priority }
        : t
    );

    setTasks(updated);
    saveTasks(updated);
    setEditingTask(null);
    setTaskText('');
    setModalVisible(false);
  };

  const cancelEdit = () => {
    setEditingTask(null);
    setTaskText('');
    setModalVisible(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>My Tasks</Text>

      <View style={styles.inputContainer}>
        <TextInput
          ref={inputRef}
          placeholder="Enter task"
          value={taskText}
          onChangeText={setTaskText}
          style={styles.input}
        />
        <View style={styles.priorityButtons}>
          {(['High', 'Medium', 'Low'] as Priority[]).map(p => (
            <TouchableOpacity
              key={p}
              onPress={() => setPriority(p)}
              style={[
                styles.priorityButton,
                priority === p && styles.priorityButtonSelected,
              ]}
            >
              <Text>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Button
          title={editingTask ? 'Save Changes' : 'Add Task'}
          onPress={editingTask ? saveEditedTask : addTask}
        />
        {editingTask && <Button title="Cancel" onPress={cancelEdit} color="orange" />}
      </View>

      <FlatList
        data={tasks}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.taskContainer}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.taskText, item.completed && styles.completedTask]}>
                {item.text}
              </Text>
              <Text style={styles.priorityText}>Priority: {item.priority}</Text>
              {item.completed && <Text style={styles.completedLabel}>✅ Completed</Text>}
            </View>
            <View style={styles.buttons}>
              <Button
                title={item.completed ? 'Undo' : 'Mark Complete'}
                onPress={() => toggleComplete(item.id)}
                color={item.completed ? '#ff9800' : '#4caf50'}
              />
              <View style={{ width: 10 }} />
              <Button title="Edit" onPress={() => editTask(item)} />
              <View style={{ width: 10 }} />
              <Button title="Delete" onPress={() => deleteTask(item.id)} color="red" />
            </View>
          </View>
        )}
      />

      {/* Undo Snackbar */}
      {undoVisible && recentlyDeletedTask && (
        <View style={styles.undoContainer}>
          <Text style={styles.undoText}>Task deleted</Text>
          <TouchableOpacity onPress={undoDelete}>
            <Text style={styles.undoButton}>UNDO</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal for Editing */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text>Edit Task</Text>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={taskText}
              onChangeText={setTaskText}
            />
            <View style={styles.priorityButtons}>
              {(['High', 'Medium', 'Low'] as Priority[]).map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPriority(p)}
                  style={[
                    styles.priorityButton,
                    priority === p && styles.priorityButtonSelected,
                  ]}
                >
                  <Text>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Button title="Save" onPress={saveEditedTask} />
            <Button title="Cancel" onPress={cancelEdit} color="gray" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 50, backgroundColor: '#f9f9f9' },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  inputContainer: { marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#aaa',
    borderRadius: 5,
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 10,
  },
  taskContainer: {
    flexDirection: 'column',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 5,
    marginBottom: 10,
  },
  taskText: { fontSize: 16 },
  completedTask: { textDecorationLine: 'line-through', color: 'gray' },
  completedLabel: { fontSize: 12, color: 'green', marginTop: 4, fontWeight: '600' },
  buttons: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  priorityButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  priorityButton: {
    padding: 8,
    borderRadius: 5,
    backgroundColor: '#eee',
    marginRight: 5,
  },
  priorityButtonSelected: {
    backgroundColor: '#cde1f9',
  },
  priorityText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#00000099',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
  },
  undoContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    padding: 12,
    backgroundColor: '#333',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  undoText: { color: '#fff' },
  undoButton: { color: '#4caf50', fontWeight: 'bold' },
});
