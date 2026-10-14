# Firebase + GitHub 연결

앱 코드: 공개 GitHub Pages. 본문·출처·태그·파일명·파일 경로: 개인 Firebase Firestore. 첨부 원본: 별도 비공개 GitHub 저장소 `kingspledu/zettel-inbox-attachments`.

## 최초 1회 설정

1. https://console.firebase.google.com 에서 Google 계정으로 프로젝트를 만들고 무료 Spark 요금제를 유지합니다. Analytics는 필수가 아닙니다.
2. 웹 앱을 등록하고 프로젝트 설정에서 firebaseConfig 객체를 복사합니다. 앱의 연결 설정에는 JavaScript 선언 없이 **올바른 JSON** 형태로 입력합니다. apiKey, authDomain, projectId, appId 등이 포함됩니다. 이것은 웹 앱 공개 설정이며 관리자 서비스 계정 키가 아닙니다.
3. Authentication에서 Google 로그인을 활성화하고 승인된 도메인에 `kingspledu.github.io`를 추가합니다.
4. Firestore Database를 만들고 먼저 잠금 모드로 시작합니다. 테스트 모드의 공개 규칙을 사용하지 않습니다.
5. Firebase Authentication 사용자 탭에서 본인 Google 계정의 UID를 확인합니다. 사용자가 없다면 앱에서 설정 확인 → Google 로그인 시도 후 사용자 탭을 확인하세요. 규칙이 잠겨 있으면 첫 로그인 후 DB 연결 실패는 정상입니다.
6. 저장소의 `firestore.rules`에서 UID 자리표시자를 본인 UID로 바꾸고 Firebase 콘솔의 Firestore 규칙 탭에 게시합니다. 개인 UID는 공개 앱 코드에 넣을 필요 없습니다. 이 규칙은 본인 UID의 `/users/{uid}/items` 경로만 허용합니다.
7. https://github.com/settings/personal-access-tokens/new 에서 fine-grained 토큰을 만듭니다. 대상 저장소는 **zettel-inbox-attachments 하나만**, Repository permissions → **Contents: Read and write**로 설정합니다. 만료일을 설정합니다. 토큰은 채팅이나 GitHub 소스에 넣지 마세요.
8. 웹앱 연결 설정에 Firebase JSON, 저장소, 토큰을 입력하고 설정 확인 → Google 로그인합니다. 화면이 클라우드 연결 상태인지 확인합니다.

## 운영

- Firebase 설정과 저장소 이름만 브라우저에 기억합니다. GitHub 토큰과 Firebase 로그인 세션은 메모리에만 유지하며 새로고침하면 재연결이 필요합니다.
- 연결 중 새로 저장·가져오기한 자료는 Firestore에, 첨부는 GitHub에 저장됩니다. 연결을 끊으면 기존 브라우저 인박스를 표시합니다. 모드 사이에 자동 복제하지 않습니다.
- `기존 브라우저 자료 옮기기`는 자료를 클라우드에 복사하고 로컬 원본은 유지합니다. 같은 ID는 건너뜁니다. 중간 실패 시 성공한 항목 수를 알리며 재시도할 수 있습니다.
- 클라우드 JSON 내보내기에서는 GitHub에서 원본을 불러와 기존 형식의 base64 첨부를 포함합니다. 어느 첨부든 실패하면 불완전한 백업을 다운로드하지 않습니다.
- 클라우드 삭제는 **Firestore 항목만 삭제**합니다. 첨부는 GitHub에 남습니다. Git은 삭제 커밋 후에도 과거 이력에 파일이 남기 때문에 완전한 삭제 기능을 제공한다고 주장하지 않습니다.
- 서비스 간 트랜잭션이 없으므로 첨부 업로드 후 DB 저장 실패 시 고아 파일이 남을 수 있습니다. 성공 여부가 모호한 네트워크 오류에서 원본을 지우지 않습니다.
- 앱은 한 번에 첨부 합계 25MB, Firestore JSON 본문 약 800KB로 제한합니다. 큰 텍스트 파일은 첨부하고 자동으로 추출된 `text_content`가 너무 크면 자료를 나누어주세요.
- 기존 IndexedDB 백업은 유지됩니다. 서버 측 자동 백업을 설정한 것은 아니므로 JSON 백업도 계속하세요.

## 검증 한계

실제 Firebase 프로젝트 설정과 규칙 게시 후 로그인, 다른 계정 접근 거부, 텍스트 저장, 첨부 저장, JSON 내보내기를 실제 계정으로 확인해야 합니다. 프로젝트가 연결되기 전에는 서버 저장이 활성화된 상태가 아닙니다.
