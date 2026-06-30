// Photo de profil → Supabase Storage (bucket public « avatars »), pour qu'elle SURVIVE à une
// réinstallation et se synchronise entre appareils. On lit le fichier local en base64, on le
// décode en binaire, puis on l'envoie sous « {userId}/avatar.jpg » (écrasement = upsert).
// Renvoie l'URL publique (avec anti-cache) ou null si l'envoi échoue (web, réseau…).

import { decode } from 'base64-arraybuffer';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

export async function uploadAvatar(userId: string, localUri: string): Promise<string | null> {
  if (!isNative) return null;
  try {
    const base64 = await new File(localUri).base64();
    const path = `${userId}/avatar.jpg`;
    const { error } = await supabase.storage.from('avatars').upload(path, decode(base64), {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (error) return null;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    // Anti-cache : même chemin réécrit (upsert) → on force le rafraîchissement de l'image.
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch {
    return null;
  }
}
