import { Entypo, FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Priority = 'High' | 'Medium' | 'Low';
type SortOption = 'priority' | 'completed' | 'reminder';

type Task = {
  id: string;
  text: string;
  priority: Priority;
  completed: boolean;
  reminderSeconds: number;
  notificationId?: string;
};

export default function App() {
  const [taskText, setTaskText] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [priority, setPriority] = useState<Priority>('Medium');
  const [reminderSeconds, setReminderSeconds] = useState(300);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletedTask, setDeletedTask] = useState<Task | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>('priority');
  const [filterPriority, setFilterPriority] = useState<'All' | Priority>('All');

  const priorityOrder = { High: 1, Medium: 2, Low: 3 };

  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission for notifications not granted');
      }
    })();
    loadTasks();
  }, []);

  const loadTasks = async () => {
    const saved = await AsyncStorage.getItem('tasks');
    if (saved) setTasks(JSON.parse(saved));
  };

  const saveTasks = async (newTasks: Task[]) => {
    await AsyncStorage.setItem('tasks', JSON.stringify(newTasks));
  };

  const scheduleNotification = async (task: Task) => {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Task Reminder',
          body: `Don't forget: ${task.text}`,
        },
        trigger: {
          type: 'timeInterval',
          seconds: task.reminderSeconds,
          repeats: false,
        } as const as Notifications.NotificationTriggerInput,
      });

      return id;
    } catch (err) {
      console.error('Notification scheduling error:', err);
      return undefined;
    }
  };

  const addOrUpdateTask = async () => {
    if (!taskText.trim()) {
      alert('Task cannot be empty');
      return;
    }

    if (editingId) {
      const updatedTasks = tasks.map((task) =>
        task.id === editingId
          ? { ...task, text: taskText, priority, reminderSeconds }
          : task
      );
      setTasks(updatedTasks);
      await saveTasks(updatedTasks);
      setEditingId(null);
    } else {
      const newTask: Task = {
        id: Date.now().toString(),
        text: taskText.trim(),
        priority,
        completed: false,
        reminderSeconds,
      };
      const notificationId = await scheduleNotification(newTask);
      if (notificationId) newTask.notificationId = notificationId;

      const updated = [newTask, ...tasks];
      setTasks(updated);
      await saveTasks(updated);
    }

    setTaskText('');
    setReminderSeconds(300);
  };

  const toggleComplete = async (taskId: string) => {
    const updated = await Promise.all(
      tasks.map(async (task) => {
        if (task.id === taskId) {
          if (!task.completed && task.notificationId) {
            await Notifications.cancelScheduledNotificationAsync(task.notificationId);
          }
          return { ...task, completed: !task.completed, notificationId: undefined };
        }
        return task;
      })
    );
    setTasks(updated);
    await saveTasks(updated);
  };

  const deleteTask = async (taskId: string) => {
    const taskToDelete = tasks.find((t) => t.id === taskId);
    if (!taskToDelete) return;
    if (taskToDelete.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(taskToDelete.notificationId);
    }
    setDeletedTask(taskToDelete);
    const updated = tasks.filter((t) => t.id !== taskId);
    setTasks(updated);
    await saveTasks(updated);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setDeletedTask(null), 5000);
  };

  const undoDelete = async () => {
    if (deletedTask) {
      const updated = [deletedTask, ...tasks];
      setTasks(updated);
      await saveTasks(updated);
      setDeletedTask(null);
      if (undoTimer.current) clearTimeout(undoTimer.current);
    }
  };

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setTaskText(task.text);
    setPriority(task.priority);
    setReminderSeconds(task.reminderSeconds);
  };

  const displayedTasks = useMemo(() => {
    let filtered = tasks;
    if (filterPriority !== 'All') {
      filtered = filtered.filter(t => t.priority === filterPriority);
    }

    let sorted = [...filtered];
    if (sortOption === 'priority') {
      sorted.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    } else if (sortOption === 'completed') {
      sorted.sort((a, b) => Number(a.completed) - Number(b.completed));
    } else if (sortOption === 'reminder') {
      sorted.sort((a, b) => a.reminderSeconds - b.reminderSeconds);
    }

    return sorted;
  }, [tasks, filterPriority, sortOption]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>📝 Task Manager</Text>

      <View style={styles.inputContainer}>
        <TextInput
          placeholder="Enter task"
          value={taskText}
          onChangeText={setTaskText}
          style={styles.input}
          placeholderTextColor="#999"
        />
        <TextInput
          placeholder="Reminder (in sec)"
          value={reminderSeconds === 0 ? '' : reminderSeconds.toString()}
          keyboardType="numeric"
          onChangeText={(v) => setReminderSeconds(Number(v) || 0)}
          style={styles.input}
          placeholderTextColor="#999"

        />

        <View style={styles.priorityButtons}>
          {(['High', 'Medium', 'Low'] as Priority[]).map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => setPriority(p)}
              style={[
                styles.priorityButton,
                p === 'High' && styles.priorityHigh,
                p === 'Medium' && styles.priorityMedium,
                p === 'Low' && styles.priorityLow,
                priority === p && styles.priorityButtonSelected,
              ]}
            >
              <Text
                style={[
                  styles.priorityText,
                  priority === p && styles.priorityTextSelected,
                ]}
              >
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Button
          title={editingId ? 'Update Task' : 'Add Task'}
          onPress={addOrUpdateTask}
          disabled={!taskText.trim()}
        />
      </View>

      <View style={styles.sortFilterContainer}>
        <View style={styles.sortFilterGroup}>
          <Text style={styles.sortFilterLabel}>Sort by:</Text>
          {(['priority', 'completed', 'reminder'] as SortOption[]).map(opt => (
            <TouchableOpacity
              key={opt}
              onPress={() => setSortOption(opt)}
              style={[
                styles.sortFilterButton,
                sortOption === opt && styles.sortFilterButtonSelected,
              ]}
            >
              <Text style={[
                styles.sortFilterText,
                sortOption === opt && styles.sortFilterTextSelected
              ]}>
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sortFilterGroup}>
          <Text style={styles.sortFilterLabel}>Filter Priority:</Text>
          {(['All', 'High', 'Medium', 'Low'] as ('All' | Priority)[]).map(p => (
            <TouchableOpacity
              key={p}
              onPress={() => setFilterPriority(p)}
              style={[
                styles.sortFilterButton,
                filterPriority === p && styles.sortFilterButtonSelected,
              ]}
            >
              <Text style={[
                styles.sortFilterText,
                filterPriority === p && styles.sortFilterTextSelected
              ]}>
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {deletedTask && (
        <TouchableOpacity onPress={undoDelete} style={styles.undoContainer}>
          <Text style={styles.undoText}>Undo delete</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={displayedTasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.taskCard}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.taskText, item.completed && styles.completed]}>
                {item.text}
              </Text>
              <Text style={styles.meta}>Priority: {item.priority}</Text>
              <Text style={styles.meta}>
                Reminder in: {item.reminderSeconds} sec
              </Text>
              {item.completed && (
                <Text style={styles.completedLabel}>✅ Completed</Text>
              )}
            </View>
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.completeButton]}
                onPress={() => toggleComplete(item.id)}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name={item.completed ? 'undo' : 'check-circle'}
                  size={20}
                  color="#fff"
                />
                <Text style={styles.actionButtonText}>
                  {item.completed ? 'Undo' : 'Complete'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.editButton]}
                onPress={() => startEdit(item)}
                activeOpacity={0.7}
              >
                <FontAwesome5 name="edit" size={18} color="#fff" />
                <Text style={styles.actionButtonText}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => deleteTask(item.id)}
                activeOpacity={0.7}
              >
                <Entypo name="trash" size={18} color="#fff" />
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f0f0f0' },
  header: { fontSize: 26, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  inputContainer: { marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#aaa',
    borderRadius: 5,
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  priorityButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  priorityButton: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 10,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
  },
  priorityHigh: {
    backgroundColor: '#ffcdd2',
    borderColor: '#d32f2f',
  },
  priorityMedium: {
    backgroundColor: '#fff9c4',
    borderColor: '#fbc02d',
  },
  priorityLow: {
    backgroundColor: '#c8e6c9',
    borderColor: '#388e3c',
  },
  priorityButtonSelected: {
    backgroundColor: '#2196f3',
    borderColor: '#1976d2',
  },
  priorityText: {
    color: '#555',
    fontWeight: '600',
  },
  priorityTextSelected: {
    color: '#fff',
  },
  undoContainer: {
    backgroundColor: '#2196f3',
    marginBottom: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  undoText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
  taskCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    elevation: 2,
  },
  taskText: { fontSize: 16 },
  completed: { textDecorationLine: 'line-through', color: 'gray' },
  completedLabel: {
    fontSize: 12,
    color: 'green',
    marginTop: 4,
    fontWeight: '600',
  },
  meta: { fontSize: 12, color: '#555' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 6,
  },
  completeButton: {
    backgroundColor: '#4caf50',
  },
  editButton: {
    backgroundColor: '#2196f3',
  },
  deleteButton: {
    backgroundColor: '#f44336',
  },
  sortFilterContainer: {
    marginBottom: 10,
  },
  sortFilterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginVertical: 5,
  },
  sortFilterLabel: {
    marginRight: 10,
    fontWeight: '600',
  },
  sortFilterButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#aaa',
    marginHorizontal: 4,
    marginVertical: 2,
  },
  sortFilterButtonSelected: {
    backgroundColor: '#2196f3',
    borderColor: '#1976d2',
  },
  sortFilterText: {
    color: '#555',
    fontWeight: '600',
  },
  sortFilterTextSelected: {
    color: '#fff',
  },
});
