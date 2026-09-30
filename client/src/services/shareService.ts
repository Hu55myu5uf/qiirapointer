import { Share, Platform, Alert } from 'react-native';

export interface ShareVendorParams {
    vendorId: string;
    businessName: string;
    category?: string;
    address?: string;
}

export interface SharePostParams {
    postId: string;
    vendorName: string;
    caption?: string;
    price?: number;
    currency?: string;
    mediaUrl?: string;
}

/**
 * Share a Vendor Profile
 */
export async function shareVendorProfile(params: ShareVendorParams): Promise<boolean> {
    try {
        const { vendorId, businessName, category, address } = params;
        const appUrl = `https://qiirapointer.app/vendor/${vendorId}`;
        const message = `Check out ${businessName} (${category || 'Business'})${address ? ` located at ${address}` : ''} on QIIRAPOINTER!\n\nView details: ${appUrl}`;

        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
            await navigator.share({
                title: `${businessName} on QIIRAPOINTER`,
                text: message,
                url: appUrl,
            });
            return true;
        }

        const result = await Share.share(
            {
                title: `${businessName} - QIIRAPOINTER`,
                message: message,
                url: appUrl,
            },
            {
                dialogTitle: `Share ${businessName}`,
            }
        );

        return result.action === Share.sharedAction;
    } catch (error: any) {
        console.error('Share vendor profile error:', error);
        return false;
    }
}

/**
 * Share a Vendor Post or Reel
 */
export async function sharePost(params: SharePostParams): Promise<boolean> {
    try {
        const { postId, vendorName, caption, price, currency = 'NGN' } = params;
        const appUrl = `https://qiirapointer.app/post/${postId}`;
        const formattedPrice = price ? ` | Price: ${currency === 'NGN' ? '₦' : '$'}${price.toLocaleString()}` : '';
        const message = `Check out this product from ${vendorName} on QIIRAPOINTER!${formattedPrice}\n\n"${caption || ''}"\n\nView on QIIRAPOINTER: ${appUrl}`;

        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
            await navigator.share({
                title: `Product by ${vendorName}`,
                text: message,
                url: appUrl,
            });
            return true;
        }

        const result = await Share.share(
            {
                title: `Product by ${vendorName}`,
                message: message,
                url: appUrl,
            },
            {
                dialogTitle: `Share Post from ${vendorName}`,
            }
        );

        return result.action === Share.sharedAction;
    } catch (error: any) {
        console.error('Share post error:', error);
        return false;
    }
}
