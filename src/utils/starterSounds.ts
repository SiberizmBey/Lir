import { SoundItem } from '../types/sound';

export const STARTER_SOUNDS: SoundItem[] = [
  {
    id: 'snd-airhorn',
    title: 'MLG Stadium Airhorn',
    hotkey: 'F1',
    duration: 1.4,
    category: 'Meme & Eğlence',
    volume: 0.9,
    isFavorite: true,
    loop: false,
    playMode: 'overlap',
    synthPreset: 'airhorn',
    addedAt: Date.now() - 100000
  },
  {
    id: 'snd-hitmarker',
    title: 'Call of Duty Hitmarker',
    hotkey: 'F2',
    duration: 0.2,
    category: 'Oyun SFX',
    volume: 1.0,
    isFavorite: true,
    loop: false,
    playMode: 'overlap',
    synthPreset: 'hitmarker',
    addedAt: Date.now() - 90000
  },
  {
    id: 'snd-808boom',
    title: 'Dramatic 808 Bass Boom',
    hotkey: 'F3',
    duration: 2.4,
    category: 'Reaksiyon',
    volume: 0.85,
    isFavorite: false,
    loop: false,
    playMode: 'overlap',
    synthPreset: '808boom',
    addedAt: Date.now() - 80000
  },
  {
    id: 'snd-levelup',
    title: 'Level Up Fanfare',
    hotkey: 'F4',
    duration: 1.1,
    category: 'Oyun SFX',
    volume: 0.8,
    isFavorite: true,
    loop: false,
    playMode: 'overlap',
    synthPreset: 'levelup',
    addedAt: Date.now() - 70000
  },
  {
    id: 'snd-bruh',
    title: 'Bruh Moment Punch',
    hotkey: 'F5',
    duration: 0.9,
    category: 'Meme & Eğlence',
    volume: 0.95,
    isFavorite: false,
    loop: false,
    playMode: 'overlap',
    synthPreset: 'bruh',
    addedAt: Date.now() - 60000
  },
  {
    id: 'snd-laser',
    title: 'Cyber Laser Pew',
    hotkey: 'F6',
    duration: 0.5,
    category: 'Oyun SFX',
    volume: 0.75,
    isFavorite: false,
    loop: false,
    playMode: 'overlap',
    synthPreset: 'laser',
    addedAt: Date.now() - 50000
  },
  {
    id: 'snd-coin',
    title: 'Super Mario Coin Chime',
    hotkey: 'F7',
    duration: 0.6,
    category: 'Oyun SFX',
    volume: 0.85,
    isFavorite: true,
    loop: false,
    playMode: 'overlap',
    synthPreset: 'coin',
    addedAt: Date.now() - 40000
  },
  {
    id: 'snd-applause',
    title: 'Crowd Cheers & Applause',
    hotkey: 'F8',
    duration: 2.0,
    category: 'Reaksiyon',
    volume: 0.8,
    isFavorite: false,
    loop: false,
    playMode: 'overlap',
    synthPreset: 'applause',
    addedAt: Date.now() - 30000
  }
];
