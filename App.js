import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { getVideoInfoAsync } from 'expo-video-metadata';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'expo-dev-client';

const BITRATE_STORAGE_KEY = '@video_bitrate';

/**
 * Formats duration in seconds to HH:MM:SS.ss like ffmpeg output
 */
function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = (seconds % 60).toFixed(2);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(5, '0')}`;
}

/**
 * Formats file size in bytes to a human-readable string
 */
function formatFileSize(bytes) {
  if (bytes === 0) return 'N/A';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(2)} ${units[i]}`;
}

/**
 * Converts bitRate from bits/s to kb/s like ffmpeg.
 * Returns null if the value is invalid.
 */
function formatBitrate(bitsPerSecond) {
  if (!bitsPerSecond || !isFinite(bitsPerSecond) || bitsPerSecond <= 0) return null;
  return `${Math.round(bitsPerSecond / 1000)} kb/s`;
}

/**
 * Calculates bitrate in bits/s from file size and duration.
 * Used as a fallback when expo-video-metadata returns NaN.
 * Formula: bitrate = (fileSize bytes × 8 bits) / duration seconds
 */
function calcBitrateFromSizeAndDuration(fileSizeBytes, durationSeconds) {
  if (!fileSizeBytes || fileSizeBytes <= 0) return null;
  if (!durationSeconds || durationSeconds <= 0) return null;
  return (fileSizeBytes * 8) / durationSeconds;
}

export default function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [videoInfo, setVideoInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savedBitrate, setSavedBitrate] = useState(null);

  // Load previously saved bitrate on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(BITRATE_STORAGE_KEY);
        if (stored) setSavedBitrate(stored);
      } catch (e) {
        console.warn('Erro ao carregar bitrate salvo:', e);
      }
    })();
  }, []);

  /**
   * Opens the system document picker filtered to video files
   */
  const pickVideo = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      setSelectedFile(asset);
      setVideoInfo(null); // Clear previous info
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível selecionar o arquivo.');
      console.error(err);
    }
  };

  /**
   * Extracts video metadata using expo-video-metadata and saves bitrate
   */
  const getVideoInfo = async () => {
    if (!selectedFile) {
      Alert.alert('Atenção', 'Selecione um vídeo primeiro.');
      return;
    }

    setLoading(true);
    try {
      const info = await getVideoInfoAsync(selectedFile.uri);

      // Resolve bitrate: prefer the value from the library, fall back to
      // calculating it from file size × 8 / duration (standard ffmpeg method).
      const libraryBitrate = formatBitrate(info.bitRate);
      const calculatedBitrate = formatBitrate(
        calcBitrateFromSizeAndDuration(info.fileSize, info.duration)
      );
      const resolvedBitrateStr = libraryBitrate ?? calculatedBitrate ?? 'N/A';
      const bitrateSource = libraryBitrate
        ? 'metadata'
        : calculatedBitrate
        ? 'calculado (tamanho ÷ duração)'
        : 'indisponível';

      setVideoInfo({ ...info, resolvedBitrateStr, bitrateSource });

      // Save bitrate persistently (only if we have a real value)
      if (resolvedBitrateStr !== 'N/A') {
        await AsyncStorage.setItem(BITRATE_STORAGE_KEY, resolvedBitrateStr);
        setSavedBitrate(resolvedBitrateStr);
      }
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível obter informações do vídeo.');
      console.error('Erro ao obter metadados:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🎬</Text>
        <Text style={styles.headerTitle}>Video Info</Text>
        <Text style={styles.headerSubtitle}>Análise de metadados de vídeo</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* File Picker Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📁 Selecionar Vídeo</Text>
          <TouchableOpacity style={styles.pickButton} onPress={pickVideo} activeOpacity={0.7}>
            <Text style={styles.pickButtonText}>
              {selectedFile ? '🔄  Trocar Arquivo' : '📂  Escolher Arquivo'}
            </Text>
          </TouchableOpacity>

          {selectedFile && (
            <View style={styles.fileInfo}>
              <Text style={styles.fileName} numberOfLines={2}>
                📎 {selectedFile.name}
              </Text>
              <Text style={styles.fileSize}>
                Tamanho: {formatFileSize(selectedFile.size)}
              </Text>
            </View>
          )}
        </View>

        {/* Action Button */}
        <TouchableOpacity
          style={[
            styles.actionButton,
            !selectedFile && styles.actionButtonDisabled,
          ]}
          onPress={getVideoInfo}
          activeOpacity={0.7}
          disabled={!selectedFile || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.actionButtonText}>🔍  Informações do Vídeo</Text>
          )}
        </TouchableOpacity>

        {/* Video Info Display - styled like ffmpeg output */}
        {videoInfo && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📊 Relatório do Vídeo</Text>

            <View style={styles.terminalBox}>
              {/* Metadata Section */}
              <Text style={styles.terminalSection}>Metadata:</Text>
              <Text style={styles.terminalLine}>
                {'    '}codec           : {videoInfo.codec || 'N/A'}
              </Text>
              <Text style={styles.terminalLine}>
                {'    '}orientation     : {videoInfo.orientation || 'N/A'}
              </Text>
              <Text style={styles.terminalLine}>
                {'    '}isHDR           : {videoInfo.isHDR === null ? 'N/A' : String(videoInfo.isHDR)}
              </Text>
              <Text style={styles.terminalLine}>
                {'    '}aspectRatio     : {videoInfo.aspectRatio?.toFixed(4) || 'N/A'}
              </Text>
              <Text style={styles.terminalLine}>
                {'    '}is16_9          : {String(videoInfo.is16_9)}
              </Text>

              {/* Duration/Bitrate line */}
              <Text style={[styles.terminalLine, styles.terminalHighlight]}>
                Duration: {formatDuration(videoInfo.duration)}, bitrate: {videoInfo.resolvedBitrateStr}
              </Text>

              {/* Bitrate source note */}
              {videoInfo.bitrateSource !== 'metadata' && (
                <Text style={[styles.terminalLine, styles.terminalMuted]}>
                  {'  '}(bitrate {videoInfo.bitrateSource})
                </Text>
              )}

              {/* Video Stream */}
              <Text style={[styles.terminalLine, styles.terminalStream]}>
                Stream #0:0: Video: {videoInfo.codec || 'N/A'}, {videoInfo.width}x{videoInfo.height}, {videoInfo.resolvedBitrateStr}, {videoInfo.fps?.toFixed(0) || '?'} fps ({videoInfo.orientation})
              </Text>

              {/* Audio Stream */}
              {videoInfo.hasAudio && (
                <Text style={[styles.terminalLine, styles.terminalStream]}>
                  Stream #0:1: Audio: {videoInfo.audioCodec || 'N/A'}, {videoInfo.audioSampleRate || '?'} Hz, {videoInfo.audioChannels || '?'} ch
                </Text>
              )}
              {!videoInfo.hasAudio && (
                <Text style={[styles.terminalLine, styles.terminalMuted]}>
                  (sem faixa de áudio)
                </Text>
              )}
            </View>

            {/* Formatted Info Cards */}
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Resolução</Text>
                <Text style={styles.infoValue}>{videoInfo.width}×{videoInfo.height}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Duração</Text>
                <Text style={styles.infoValue}>{formatDuration(videoInfo.duration)}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>FPS</Text>
                <Text style={styles.infoValue}>{videoInfo.fps?.toFixed(0) || 'N/A'}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Bitrate</Text>
                <Text style={[styles.infoValue, styles.bitrateValue]}>
                  {videoInfo.resolvedBitrateStr}
                </Text>
                {videoInfo.bitrateSource !== 'metadata' && (
                  <Text style={styles.bitrateSourceLabel}>{videoInfo.bitrateSource}</Text>
                )}
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Codec</Text>
                <Text style={styles.infoValue}>{videoInfo.codec || 'N/A'}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Tamanho</Text>
                <Text style={styles.infoValue}>{formatFileSize(videoInfo.fileSize)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Saved Bitrate Indicator */}
        {savedBitrate && (
          <View style={styles.savedBitrateCard}>
            <Text style={styles.savedBitrateLabel}>💾 Bitrate Salvo (persistente)</Text>
            <Text style={styles.savedBitrateValue}>{savedBitrate}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 24,
    backgroundColor: '#101829',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e2d4a',
  },
  headerIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#e0e8f5',
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#5a7aa5',
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#131d30',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e2d4a',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8fb8e0',
    marginBottom: 16,
  },

  // File Picker
  pickButton: {
    backgroundColor: '#1a3a5c',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a5a8c',
    borderStyle: 'dashed',
  },
  pickButtonText: {
    color: '#7ab8e8',
    fontSize: 16,
    fontWeight: '600',
  },
  fileInfo: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#1e2d4a',
  },
  fileName: {
    color: '#c8d8ea',
    fontSize: 14,
    fontWeight: '500',
  },
  fileSize: {
    color: '#5a7aa5',
    fontSize: 12,
    marginTop: 4,
  },

  // Action Button
  actionButton: {
    backgroundColor: '#0d6efd',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#0d6efd',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  actionButtonDisabled: {
    backgroundColor: '#1a2a40',
    shadowOpacity: 0,
    elevation: 0,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Terminal-style Output
  terminalBox: {
    backgroundColor: '#0a0f1a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1a2a40',
    marginBottom: 16,
  },
  terminalSection: {
    color: '#8fb8e0',
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '700',
    marginBottom: 4,
  },
  terminalLine: {
    color: '#7a9ab8',
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  terminalHighlight: {
    color: '#4fc3f7',
    fontWeight: '600',
    marginTop: 8,
  },
  terminalStream: {
    color: '#81c784',
    marginTop: 4,
  },
  terminalMuted: {
    color: '#4a5a6a',
    fontStyle: 'italic',
    marginTop: 4,
  },

  // Info Grid
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoItem: {
    backgroundColor: '#0d1624',
    borderRadius: 10,
    padding: 12,
    width: '47%',
    borderWidth: 1,
    borderColor: '#1a2a40',
  },
  infoLabel: {
    color: '#5a7aa5',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  infoValue: {
    color: '#e0e8f5',
    fontSize: 16,
    fontWeight: '700',
  },
  bitrateValue: {
    color: '#ffd54f',
  },
  bitrateSourceLabel: {
    color: '#8a6a00',
    fontSize: 10,
    marginTop: 2,
    fontStyle: 'italic',
  },

  // Saved Bitrate
  savedBitrateCard: {
    backgroundColor: '#1a2a12',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a4a1a',
    alignItems: 'center',
  },
  savedBitrateLabel: {
    color: '#81c784',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  savedBitrateValue: {
    color: '#a5d6a7',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
