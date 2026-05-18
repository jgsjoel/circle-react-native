import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export type AttachmentOption = 'photos' | 'videos' | 'files';

interface AttachmentMenuProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: AttachmentOption) => void;
}

const OPTIONS: {
  key: AttachmentOption;
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  iconColor: string;
  bgColor: string;
}[] = [
  { key: 'photos', icon: 'image',            label: 'Photos', iconColor: '#a78bfa', bgColor: '#4c1d95' },
  { key: 'videos', icon: 'videocam',          label: 'Videos', iconColor: '#38bdf8', bgColor: '#164e63' },
  { key: 'files',  icon: 'insert-drive-file', label: 'Files',  iconColor: '#6ee7b7', bgColor: '#064e3b' },
];

export function AttachmentMenu({ visible, onClose, onSelect }: AttachmentMenuProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable>
          <View style={styles.dialog}>
            {/* Title row */}
            <View style={styles.titleRow}>
              <Text style={styles.title}>Attach</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <MaterialIcons name="close" size={20} color="#71717a" />
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {/* Options */}
            {OPTIONS.map((opt, index) => (
              <React.Fragment key={opt.key}>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => { onClose(); onSelect(opt.key); }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconWrap, { backgroundColor: opt.bgColor }]}>
                    <MaterialIcons name={opt.icon} size={22} color={opt.iconColor} />
                  </View>
                  <Text style={styles.rowLabel}>{opt.label}</Text>
                  <MaterialIcons name="chevron-right" size={20} color="#52525b" />
                </TouchableOpacity>
                {index < OPTIONS.length - 1 && <View style={styles.rowDivider} />}
              </React.Fragment>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  dialog: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    paddingTop: 20,
    paddingBottom: 8,
    width: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#27272a',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  rowLabel: {
    flex: 1,
    color: '#e4e4e7',
    fontSize: 15,
    fontWeight: '500',
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#27272a',
    marginLeft: 74,
  },
});
