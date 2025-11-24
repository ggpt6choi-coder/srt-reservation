// Service Worker 설치
self.addEventListener('install', function (event) {
    console.log('[SW] 설치됨');
    self.skipWaiting(); // 즉시 활성화
});

// Service Worker 활성화
self.addEventListener('activate', function (event) {
    console.log('[SW] 활성화됨');
    event.waitUntil(self.clients.claim()); // 모든 클라이언트 제어
});

self.addEventListener('push', function (event) {
    console.log('[SW] 푸시 이벤트 수신!');
    console.log('[SW] event:', event);
    console.log('[SW] event.data:', event.data);

    let title = 'SRT 알림';
    let options = {
        body: '알림이 도착했습니다.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        requireInteraction: true,
        tag: 'srt-notification',
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        }
    };

    if (event.data) {
        console.log('[SW] 데이터 있음');
        try {
            const data = event.data.json();
            console.log('[SW] 파싱된 데이터:', data);
            title = data.title || title;
            options.body = data.body || options.body;
        } catch (e) {
            console.error('[SW] JSON 파싱 실패:', e);
            try {
                const textData = event.data.text();
                console.log('[SW] 텍스트 데이터:', textData);
                options.body = textData;
            } catch (e2) {
                console.error('[SW] 텍스트 파싱도 실패:', e2);
            }
        }
    } else {
        console.log('[SW] 데이터 없음 - 기본 알림 표시');
    }

    console.log('[SW] 알림 표시 시도:', title, options);

    event.waitUntil(
        self.registration.showNotification(title, options)
            .then(() => console.log('[SW] ✅ 알림 표시 성공!'))
            .catch(err => console.error('[SW] ❌ 알림 표시 실패:', err))
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            if (clientList.length > 0) {
                let client = clientList[0];
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i];
                    }
                }
                return client.focus();
            }
            return clients.openWindow('/');
        })
    );
});
