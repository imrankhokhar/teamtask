import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function navigateToTask(taskId: string) {
  if (!taskId || !navigationRef.isReady()) return;
  navigationRef.navigate('TaskDetail' as never, { id: taskId } as never);
}

/** Consume `?task=` deep link (web SW notification click / shared URL). */
export function consumeTaskDeepLink() {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const taskId = url.searchParams.get('task');
    if (!taskId) return;
    url.searchParams.delete('task');
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', next);
    navigateToTask(taskId);
  } catch {
    // ignore
  }
}
