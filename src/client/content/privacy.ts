/**
 * Privacy policy content (bilingual). Rendered like docs.ts: text only, **bold** markers supported, never v-html.
 */

export type PolicySection = {
  id: string
  title: string
  body: string[]
  bullets?: string[]
}

export const privacy: Record<'en' | 'ja', PolicySection[]> = {
  en: [
    {
      id: 'operator',
      title: 'Who we are',
      body: [
        'TickPoint (https://point.aryuki.com) is operated by Aryuki. This policy explains what information TickPoint handles, why, and the choices you have.',
      ],
    },
    {
      id: 'sign-in',
      title: 'Sign-in and account information',
      body: [
        'You sign in with Aryuki Accounts (https://accounts.aryuki.com). TickPoint never receives or stores your password. From Aryuki Accounts, TickPoint receives:',
      ],
      bullets: [
        'your verified account ID, display name and username',
        'your email address, if your account has one',
        'your avatar URL and role',
      ],
    },
    {
      id: 'stored-data',
      title: 'What we store',
      body: [
        'TickPoint stores the following on Cloudflare infrastructure (a D1 database and R2 storage):',
      ],
      bullets: [
        'tasks, deadlines, goals, checkpoints and progress entries',
        'reminders and notification history, and your settings',
        'original texts you choose to save from Smart Capture, and AI drafts while you review them',
        'AI usage records (token counts) and an activity history of changes',
        'browser push subscriptions',
        'notification email addresses. Verification codes are stored only as one-way hashes and expire after 20 minutes.',
        'file attachments and backups you create',
        'sign-in session records. The sign-in token is stored encrypted.',
      ],
    },
    {
      id: 'cookies',
      title: 'Cookies and local storage',
      body: [
        'TickPoint uses one essential session cookie (HttpOnly) and a short-lived sign-in state cookie. We do not use advertising or third-party tracking cookies. Local storage keeps interface preferences such as language, theme and layout.',
      ],
    },
    {
      id: 'ai',
      title: 'AI processing',
      body: [
        'Text is sent to the Google Gemini API only when you click **Analyze** in Smart Capture or **Generate checkpoints** for a deadline or goal, and only the text that request needs. Your credentials, cookies and other users\' data are never sent.',
        'AI results are drafts until you confirm them. You can turn AI features off in **Settings → AI**. Token counts are reported to Aryuki Accounts to apply usage limits.',
      ],
    },
    {
      id: 'email',
      title: 'Email',
      body: [
        'Reminder and verification emails are sent from noreply@point.aryuki.com through Cloudflare Email Service. They are sent only to addresses that are verified and enabled.',
      ],
    },
    {
      id: 'push',
      title: 'Push notifications',
      body: [
        'Browser push messages are delivered through your browser\'s push service (for example Google, Apple or Mozilla), using the subscription your browser creates. You can disable push notifications at any time.',
      ],
    },
    {
      id: 'analytics',
      title: 'Sign-in analytics',
      body: [
        'When you sign in, a sign-in event (app ID and account ID) is reported to Aryuki Accounts. TickPoint runs no other analytics.',
      ],
    },
    {
      id: 'retention',
      title: 'How long we keep data',
      body: ['We keep data only as long as needed:'],
      bullets: [
        'temporary copies of source text in pending AI drafts: removed after 7 days',
        'rejected AI drafts: removed after 30 days',
        'delivery logs: removed after 90 days',
        'read notifications: removed after 180 days',
        'expired sessions: cleaned up daily',
        'backups: the 10 most recent are kept',
      ],
    },
    {
      id: 'choices',
      title: 'Your choices and rights',
      body: [
        'Deleting your Aryuki account itself is handled by Aryuki Accounts. Within TickPoint you can:',
      ],
      bullets: [
        'view and edit everything in the app',
        'export your data as JSON or CSV',
        'delete saved original texts and remove notification email addresses',
        'delete all your TickPoint data in **Settings → Data**. This is permanent.',
        'sign out of TickPoint, or of Aryuki Accounts',
      ],
    },
    {
      id: 'security',
      title: 'Security',
      body: [
        'We use HTTPS everywhere and a strict content security policy. Session tokens are encrypted, and every request is limited to your own data.',
      ],
    },
    {
      id: 'sale',
      title: 'Selling and advertising',
      body: ['Your data is not sold, and it is not used for advertising.'],
    },
    {
      id: 'changes',
      title: 'Changes to this policy',
      body: ['When we update this policy, we will post the changes on this page with a new effective date.'],
    },
    {
      id: 'contact',
      title: 'Contact',
      body: [
        'For questions about this policy, use the support options of Aryuki Accounts at https://accounts.aryuki.com.',
      ],
    },
  ],
  ja: [
    {
      id: 'operator',
      title: '運営者について',
      body: [
        'TickPoint（https://point.aryuki.com）は Aryuki が運営しています。このポリシーでは、TickPoint がどのような情報を扱い、なぜ扱うのか、そしてあなたが選べることを説明します。',
      ],
    },
    {
      id: 'sign-in',
      title: 'サインインとアカウント情報',
      body: [
        'Aryuki アカウント（https://accounts.aryuki.com）でサインインします。TickPoint がパスワードを受け取ったり保存したりすることはありません。Aryuki アカウントから、TickPoint は次の情報を受け取ります。',
      ],
      bullets: [
        '確認済みのアカウント ID、表示名、ユーザー名',
        'メールアドレス（アカウントに登録されている場合）',
        'アバターの URL とロール',
      ],
    },
    {
      id: 'stored-data',
      title: '保存する情報',
      body: [
        'TickPoint は次の情報を Cloudflare のインフラ（D1 データベースと R2 ストレージ）に保存します。',
      ],
      bullets: [
        'タスク、締め切り、目標、チェックポイント、進捗の記録',
        'リマインダーと通知の履歴、および設定',
        'スマートキャプチャで保存を選んだ元のテキスト、確認中の AI 下書き',
        'AI の利用記録（トークン数）と、変更の履歴',
        'ブラウザのプッシュ購読情報',
        '通知用のメールアドレス。確認コードは一方向のハッシュとしてのみ保存され、20分で期限切れになります。',
        'あなたが作成した添付ファイルとバックアップ',
        'サインインのセッション記録。サインイン用トークンは暗号化して保存されます。',
      ],
    },
    {
      id: 'cookies',
      title: 'Cookie とローカルストレージ',
      body: [
        'TickPoint は、必須のセッション Cookie（HttpOnly）と、短時間だけ有効なサインイン状態の Cookie を1つずつ使用します。広告用や第三者による追跡用の Cookie は使用しません。ローカルストレージには、言語、テーマ、レイアウトなどの表示設定を保存します。',
      ],
    },
    {
      id: 'ai',
      title: 'AI による処理',
      body: [
        'スマートキャプチャで **分析** を実行したとき、または締め切りや目標で **チェックポイントを生成** を実行したときに限り、そのリクエストに必要なテキストが Google Gemini API に送信されます。認証情報、Cookie、他のユーザーのデータが送信されることはありません。',
        'AI の結果は、あなたが確定するまで下書きとして扱われます。**設定 → AI** で AI 機能をオフにできます。利用上限を適用するため、トークン数は Aryuki アカウントに報告されます。',
      ],
    },
    {
      id: 'email',
      title: 'メール',
      body: [
        'リマインダーや確認のメールは、Cloudflare Email Service を通じて noreply@point.aryuki.com から送信されます。送信先は、確認済みで有効になっているアドレスだけです。',
      ],
    },
    {
      id: 'push',
      title: 'プッシュ通知',
      body: [
        'ブラウザのプッシュ通知は、ブラウザが作成した購読情報を使い、ブラウザのプッシュサービス（Google、Apple、Mozilla など）を経由して届けられます。プッシュ通知はいつでも無効にできます。',
      ],
    },
    {
      id: 'analytics',
      title: 'サインインの分析',
      body: [
        'サインインすると、サインインイベント（アプリ ID とアカウント ID）が Aryuki アカウントに報告されます。TickPoint はそれ以外の分析を行いません。',
      ],
    },
    {
      id: 'retention',
      title: 'データの保存期間',
      body: ['必要な期間だけデータを保持します。'],
      bullets: [
        '確認待ちの AI 下書きにある元のテキストの一時コピー: 7日後に削除',
        '却下された AI 下書き: 30日後に削除',
        '配信ログ: 90日後に削除',
        '既読の通知: 180日後に削除',
        '期限切れのセッション: 毎日整理',
        'バックアップ: 直近の10件を保持',
      ],
    },
    {
      id: 'choices',
      title: 'あなたの選択と権利',
      body: [
        'Aryuki アカウント自体の削除は、Aryuki アカウントで行われます。TickPoint では次のことができます。',
      ],
      bullets: [
        'アプリ内のすべての情報の閲覧と編集',
        'データの JSON または CSV での書き出し',
        '保存した元のテキストの削除と、通知用メールアドレスの削除',
        '**設定 → データ** での、TickPoint のすべてのデータの削除（元に戻せません）',
        'TickPoint、または Aryuki アカウントからのサインアウト',
      ],
    },
    {
      id: 'security',
      title: 'セキュリティ',
      body: [
        'すべての通信に HTTPS を使用し、厳格なコンテンツセキュリティポリシーを適用しています。セッショントークンは暗号化され、すべてのリクエストはあなた自身のデータに限定されます。',
      ],
    },
    {
      id: 'sale',
      title: '販売と広告',
      body: ['お客様のデータを販売することはありません。また、広告のために利用することもありません。'],
    },
    {
      id: 'changes',
      title: 'このポリシーの変更',
      body: ['このポリシーを更新した場合は、このページに変更内容を掲載し、施行日を新しくします。'],
    },
    {
      id: 'contact',
      title: 'お問い合わせ',
      body: [
        'このポリシーに関するご質問は、Aryuki アカウント（https://accounts.aryuki.com）のサポート窓口をご利用ください。',
      ],
    },
  ],
}
