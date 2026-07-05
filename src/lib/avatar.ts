// Photo de profil → Supabase Storage (bucket public « avatars »), pour qu’elle SURVIVE à une
// réinstallation et se synchronise entre appareils. En natif on lit le fichier local en base64
// (expo-file-system) ; sur WEB (Espace Club/opérateur de bureau) `pickImage` renvoie un data-URI
// qu’on décode directement — sans ça, définir une photo était impossible sur le web.
// On envoie sous « {userId}/avatar.jpg » (écrasement = upsert). Renvoie l’URL publique ou null.

import { decode } from 'base64-arraybuffer';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

// Web : « data:image/xxx;base64,…… » → octets + type MIME réel (png/jpeg/webp…).
export function decodeDataUri(uri: string): { bytes: ArrayBuffer; contentType: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(uri);
  if (!m) return null;
  return { bytes: decode(m[2]), contentType: m[1] || 'image/jpeg' };
}

export async function uploadAvatar(userId: string, localUri: string): Promise<string | null> {
  try {
    const payload = isNative ? { bytes: decode(await new File(localUri).base64()), contentType: 'image/jpeg' } : decodeDataUri(localUri);
    if (!payload) return null;
    const path = `${userId}/avatar.jpg`;
    const { error } = await supabase.storage.from('avatars').upload(path, payload.bytes, {
      contentType: payload.contentType,
      upsert: true,
    });
    if (error) return null;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    // Anti-cache : même chemin réécrit (upsert) → on force le rafraîchissement de l’image.
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch {
    return null;
  }
}
