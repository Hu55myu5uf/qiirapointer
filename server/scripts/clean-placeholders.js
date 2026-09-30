const { auth, db } = require('../dist/config/firebase');
const supabase = require('../dist/config/supabase').default;

const placeholderUids = [
  '1LCp0egoYscasMEjoqVM1A1F05A2', // wellness.clinic@qiira.com
  'OoMDHEO59vR9AuiXTEKhddEAKyl1', // tech.repair@qiira.com
  'TKPUKMJvQkbdLDHn45d3BvJEHZe2', // fresh.market@qiira.com
  '9nkOOSYgWvThUzZ5WQHqp9uNJlS2', // italian.bistro@qiira.com
  'eHB97I3PqsTHaWD9IsTugO2bNDO2', // beauty.spa@qiira.com
  'fGulYF70HbMbZTOSNKUlVhYM8952', // learning.academy@qiira.com
  'EfRZHe1QZFNtZsk3EWZe1Tq2POt1', // vendor1@qiira.com
  'F6oe6gedhXWP2wvvlJ3a0bdBsl82', // vendor2@qiira.com
  'bJ55GkKIT4N37xiBkUxrGXCZc7O2', // vendor3@qiira.com
  'XG5W6pMYHLZdzUT1ZUUEdBfFZYF3', // vendor4@qiira.com
  'OnZMuFEkXUXCMHFf279p0EDgGXz1', // vendor5@qiira.com
  'gQaMUwUqB5fXteRRfMoP00XhaTq2', // vendor6@qiira.com
  'brkD4YHshkSsaUAGfFhHwdoVaxL2', // vendor7@qiira.com
  'VuNY1blRqtde5afFo4UFuGYg1sw2', // client1@qiira.com
  'P4G0MNG0PhfzdZjyjSGbO68dvCt1', // client@qiira.com
  'Y1N9dH1zVxTxB0XL5qIhAGdlF043', // test@qiira.com
  'RHGpRbF5VEY0DwvaowgtspiEQOt2'  // test@qiirapointer.com
];

async function removePlaceholders() {
  console.log('Starting full cleanup of', placeholderUids.length, 'placeholder accounts...');
  
  for (const uid of placeholderUids) {
    console.log('Processing UID:', uid);
    
    // 1. Firebase Auth
    try {
      await auth.deleteUser(uid);
      console.log('  - Deleted from Firebase Auth:', uid);
    } catch (e) {
      console.log('  - Auth note:', e.message);
    }

    // 2. Firestore Users
    try {
      await db.collection('users').doc(uid).delete();
      console.log('  - Deleted from Firestore users:', uid);
    } catch (e) {
      console.log('  - Firestore users note:', e.message);
    }

    // 3. Firestore Vendors
    try {
      await db.collection('vendors').doc(uid).delete();
      const vByUid = await db.collection('vendors').where('uid', '==', uid).get().catch(() => null);
      if (vByUid && !vByUid.empty) {
        for (const d of vByUid.docs) {
          await d.ref.delete();
        }
      }
      console.log('  - Deleted from Firestore vendors:', uid);
    } catch (e) {
      console.log('  - Firestore vendors note:', e.message);
    }

    // 4. Firestore Posts, Reviews, Conversations, Messages
    try {
      const posts = await db.collection('posts').where('vendorId', '==', uid).get().catch(() => null);
      if (posts && !posts.empty) {
        for (const d of posts.docs) await d.ref.delete();
      }
      const reviews = await db.collection('reviews').where('vendorId', '==', uid).get().catch(() => null);
      if (reviews && !reviews.empty) {
        for (const d of reviews.docs) await d.ref.delete();
      }
    } catch (_) {}

    // 5. Supabase Messages, Conversations, Posts, Reviews, Cart, Favorites
    try {
      await supabase.from('messages').delete().eq('sender_id', uid);
      await supabase.from('messages').delete().eq('receiver_id', uid);
      await supabase.from('conversations').delete().eq('client_id', uid);
      await supabase.from('conversations').delete().eq('vendor_id', uid);
      await supabase.from('posts').delete().eq('vendor_id', uid);
      await supabase.from('reviews').delete().eq('vendor_id', uid);
      await supabase.from('reviews').delete().eq('client_id', uid);
      await supabase.from('favorites').delete().eq('vendor_id', uid);
      await supabase.from('favorites').delete().eq('user_id', uid);
    } catch (_) {}

    // 6. Supabase Vendors
    try {
      await supabase.from('vendors').delete().eq('uid', uid);
      console.log('  - Deleted from Supabase vendors:', uid);
    } catch (e) {
      console.log('  - Supabase vendors note:', e.message);
    }

    // 7. Supabase Users
    try {
      const { error } = await supabase.from('users').delete().eq('uid', uid);
      if (error) {
        console.log('  - Supabase user error:', error.message);
      } else {
        console.log('  - Deleted from Supabase users:', uid);
      }
    } catch (e) {
      console.log('  - Supabase users note:', e.message);
    }
  }

  const { data: su } = await supabase.from('users').select('uid, email, full_name, role');
  console.log('Remaining registered Supabase users:', su);

  console.log('Cleanup completed successfully!');
  process.exit(0);
}

removePlaceholders();
