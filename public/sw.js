
self.addEventListener('push', function (event) {
    console.log('푸시 이벤트 수신:', event);

    let title = 'SRT 알림';
    let options = {
        body: '알림이 도착했습니다.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        }
    };

    if (event.data) {
        try {
            const data = event.data.json();
            console.log('푸시 데이터:', data);
            title = data.title || title;
            options.body = data.body || options.body;
        } catch (e) {
            console.error('푸시 데이터 파싱 실패:', e);
            // 텍스트로 시도
            options.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(title, options)
            .then(() => console.log('알림 표시 성공'))
            .catch(err => console.error('알림 표시 실패:', err))
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
