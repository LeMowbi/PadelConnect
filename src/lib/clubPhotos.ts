// Photos de club → Supabase Storage (bucket public « club-photos »), pour qu’elles soient
// visibles par TOUS les joueurs et survivent à une réinstallation. Même principe que l’avatar :
// on lit le fichier local en base64, on le décode, puis on l’envoie sous « {clubId}/{nom}.jpg ».
// Le nom est unique (dérivé du temps) pour empiler plusieurs photos. Renvoie l’URL publique.

import { decode } from 'base64-arraybuffer';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { decodeDataUri } from './avatar';
import { supabase } from './supabase';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

export async function uploadClubPhoto(clubId: string, localUri: string): Promise<string | null> {
  try {
    // Natif : fichier local (expo-file-system). Web (Espace Club de bureau) : data-URI décodé —
    // sans ça, un gérant sur ordinateur ne pouvait ajouter aucune photo (cover, terrain, galerie).
    const payload = isNative ? { bytes: decode(await new File(localUri).base64()), contentType: 'image/jpeg' } : decodeDataUri(localUri);
    if (!payload) return null;
    const path = `${clubId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('club-photos').upload(path, payload.bytes, {
      contentType: payload.contentType,
      upsert: true,
    });
    if (error) return null;
    const { data } = supabase.storage.from('club-photos').getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return null;
  }
}

// Suppression best-effort d’une photo de club à partir de son URL publique (le gérant la retire).
export async function removeClubPhotoFile(url: string): Promise<void> {
  try {
    const marker = '/club-photos/';
    const i = url.indexOf(marker);
    if (i < 0) return;
    const path = url.slice(i + marker.length).split('?')[0];
    await supabase.storage.from('club-photos').remove([path]);
  } catch {
    // best-effort : si la suppression du fichier échoue, l’URL est déjà retirée de la liste.
  }
}
