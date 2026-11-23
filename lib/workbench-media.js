import { completionVoices, spellVoices, spellVoiceRoute, voiceRoute } from './workbench-voice-assets.js';

export const themeRoot = '/gojo-theme/';
export const introVideo = themeRoot + 'intro/v8/infinite-void.mp4';
export const forkMediaRoot = themeRoot + 'fork-domain/';
export const recordRoot = themeRoot + 'records/';
export const brandPortrait = themeRoot + 'art/local-portrait.png';

const slot = (url, file, type = 'audio/mp4') => ({ url, file, type });
export const localMedia = [
  slot(introVideo, 'intro.mp4', 'video/mp4'),
  slot(brandPortrait, 'portrait.png', 'image/png'),
  slot(forkMediaRoot + 'voice.m4a', 'fork-domain/voice.m4a'),
  slot(forkMediaRoot + 'scan.m4a', 'fork-domain/scan.m4a'),
  ...['specialz', 'kaikai-kitan', 'where-our-blue-is-acoustic'].map(id =>
    slot(recordRoot + id + '.m4a', 'records/' + id + '.m4a')),
  ...completionVoices.map(file => slot(voiceRoute + file, 'voices/' + file)),
  ...spellVoices.map(file => slot(spellVoiceRoute + file, 'spell-voices/' + file)),
];

export async function readAvailableMedia(signal) {
  try {
    const response = await fetch(themeRoot + 'local-media', {
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
    });
    return new Set(response.ok ? await response.json() : []);
  } catch {
    return new Set();
  }
}
