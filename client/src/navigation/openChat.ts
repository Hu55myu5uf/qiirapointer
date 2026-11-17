/**
 * Open a conversation the way messaging apps do: inside the Messages tab, with the
 * conversation list underneath, so Back always leads to your chat history.
 * (Admins have no Messages tab; for them the chat opens in the current stack.)
 */
export function openChat(navigation: any, params: Record<string, any>) {
    let nav = navigation;
    while (nav) {
        const state = nav.getState?.();
        if (state?.routeNames?.includes('Messages')) {
            nav.navigate('Messages', { screen: 'Chat', params, initial: false });
            return;
        }
        nav = nav.getParent?.();
    }
    navigation.navigate('Chat', params);
}
