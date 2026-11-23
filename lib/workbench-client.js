import { brandPortrait, introVideo, readAvailableMedia } from './workbench-media.js';
import stylesheet from './workbench-theme.css';
import recordStyles from './workbench-records.css';
import { mountRecords } from './workbench-records.js';
import introStyles from './workbench-intro.css';
import { mountIntro } from './workbench-intro.js';
import { mountCompletionVoice } from './workbench-completion-voice.js';
import streamOrbStyles from './workbench-stream-orb.css';
import { mountStreamOrb } from './workbench-stream-orb.js';
import forkDomainStyles from './workbench-fork-domain.css';
import { mountForkDomain } from './workbench-fork-domain.js';

export const name = 'gojo-theme';

export function apply(ctx) {
  if (location.protocol !== 'dsh-app:' || location.hostname !== 'app') return;

  const lifetime = new AbortController();
  const available = new Set();
  const ready = readAvailableMedia(lifetime.signal).then(urls => {
    for (const url of urls) available.add(url);
  });
  ctx.inject(['sessions'], scope => {
    scope.effect(() => {
      const orb = mountStreamOrb(available);
      const stopVoice = mountCompletionVoice(scope.sessions, orb, available);
      const stopForkDomain = mountForkDomain(scope.sessions, available);
      return () => {
        stopForkDomain();
        stopVoice();
        orb?.dispose();
      };
    }, 'Gojo session effects');
  });
  ctx.effect(() => {
    const style = document.createElement('style');
    style.id = 'gojo-workbench-theme';
    style.textContent = stylesheet + introStyles + recordStyles + streamOrbStyles + forkDomainStyles;
    document.head.append(style);
    let stopIntro;
    let stopRecords;
    void ready.then(() => {
      if (lifetime.signal.aborted) return;
      if (available.has(brandPortrait)) {
        style.textContent += `
#root [data-slot="sidebar"] .kB3qhq_brandMark:has(svg)::before {
          background-image: url("${brandPortrait}");
        }`;
      }
      stopRecords = mountRecords(available);
      if (available.has(introVideo)) stopIntro = mountIntro();
    });
    return () => {
      lifetime.abort();
      stopIntro?.();
      stopRecords?.();
      style.remove();
    };
  }, 'Gojo workbench theme');
}
