import { Alert } from 'react-native';
import { postAPI } from '../services/api';

/** Who may delete a comment: its author, the post's owner, or an admin (the server enforces this too). */
export function canDeleteComment(comment: any, post: any, viewerId?: string | null, isAdmin = false): boolean {
    if (!viewerId) return false;
    return isAdmin || comment?.userId === viewerId || post?.vendorId === viewerId || post?.authorId === viewerId;
}

/** Ask for confirmation, delete the comment, then call onDeleted(commentId). */
export function confirmDeleteComment(postId: string, commentId: string, onDeleted: (id: string) => void) {
    Alert.alert('Delete comment?', 'This comment will be removed for everyone.', [
        { text: 'Cancel', style: 'cancel' },
        {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
                try {
                    await postAPI.deleteComment(postId, commentId);
                    onDeleted(commentId);
                } catch (e: any) {
                    Alert.alert('Could not delete', e?.response?.data?.error || 'Please try again.');
                }
            },
        },
    ]);
}
