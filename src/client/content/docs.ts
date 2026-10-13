/**
 * Help guide content. Long-form bilingual text lives here; UI chrome is in src/locales/parts/legal.*.json.
 * In body and bullets, text wrapped in ** is rendered as <strong> (see boldParts). Never render this with v-html.
 */

export type DocsImage = {
  /** Base name of a file in public/docs-media/<locale>/ (without extension). */
  file: string
  alt: string
  caption?: string
  /** Phone screenshot (780x1688) rather than desktop (1920x1200). */
  mobile?: boolean
}

export type DocsSection = {
  id: string
  title: string
  body: string[]
  bullets?: string[]
  image?: DocsImage
  images?: DocsImage[]
}

export type DocsLocale = 'en' | 'ja'

export const docs: Record<DocsLocale, DocsSection[]> = {
  en: [
    {
      id: 'getting-started',
      title: 'Getting started',
      body: [
        'TickPoint is a calm place to keep deadlines, tasks and goals, and the checkpoints that lead to them. Sign in with **Aryuki Accounts**. TickPoint never sees your password.',
        'The interface language follows your browser: Japanese if Japanese is your preferred language, English otherwise. You can change it at any time.',
      ],
      image: { file: 'overview', alt: 'The Overview page showing Today, upcoming deadlines and active goals' },
    },
    {
      id: 'overview',
      title: 'The Overview page',
      body: ['The Overview page is your starting point. It shows:'],
      bullets: [
        '**Today**: what is scheduled or due today.',
        '**Upcoming deadlines**, with live countdowns.',
        '**Needs attention**: overdue and at-risk items, with the reason.',
        '**Active goals** and **recent progress**.',
        '**Weekly numbers** that summarise what you have completed.',
        '**Quick capture**: add a task to your Inbox in one line. Longer pasted text can be sent to Smart Capture instead.',
      ],
    },
    {
      id: 'inbox',
      title: 'Inbox, Today, Upcoming and Deadlines',
      body: [
        'The **Inbox** is the place for things you have not organised yet: tasks without a project, goal, parent task or due date, such as quick captures. Review it regularly. Once you give an item a due date, project or goal, it leaves the Inbox.',
        'The other lists show your tasks by time:',
      ],
      bullets: [
        '**Today**: tasks scheduled for today or due today, plus anything overdue.',
        '**Upcoming**: tasks in the next 14 days.',
        '**Deadlines**: all strict deadlines.',
      ],
      image: { file: 'today', alt: 'The Today list with scheduled tasks and an overdue item' },
    },
    {
      id: 'deadlines',
      title: 'Deadlines and precision',
      body: [
        'Every deadline gets a risk level: **On track**, **Attention needed**, **At risk** or **Overdue**. The level is based on the time remaining, the estimated effort compared with your available hours, your progress, delayed checkpoints and blocking dependencies. Countdown chips show the time left and update live.',
        'Deadlines come in four precision levels, so TickPoint never invents a time:',
      ],
      bullets: [
        '**Exact date and time**: stored with its time zone. TickPoint shows the time in your zone and in the original zone.',
        '**Date only**: overdue once that whole day has ended. No time is set.',
        '**Approximate**: a rough timing, such as "early next month".',
        '**Unknown**: a deadline whose date is not yet known.',
      ],
      image: { file: 'task-detail', alt: 'A task detail view with a deadline, countdown and risk level' },
    },
    {
      id: 'quick-add',
      title: 'Quick add and search',
      body: [
        'Press **Q** to add a task or a deadline. On a phone, use the **+** button. Press **Ctrl/Cmd+K** to open search.',
      ],
    },
    {
      id: 'smart-capture',
      title: 'Smart Capture',
      body: [
        'Paste an announcement or an email, then select **Analyze with AI** (Google Gemini). Review the result before anything is saved. Nothing is saved until you press **Confirm & create**, and you choose whether to keep the original text.',
      ],
      bullets: [
        'The original text is on the left, with the evidence for each item highlighted.',
        'The extracted fields are on the right. Every field is editable.',
        'Items marked **Interpreted** or **Evidence not found in source** deserve a closer look.',
        'Mark any ambiguities as reviewed.',
      ],
      images: [
        { file: 'capture-paste', alt: 'Smart Capture with pasted announcement text ready to analyze' },
        { file: 'capture-review', alt: 'Smart Capture review with the original text beside the extracted fields' },
      ],
    },
    {
      id: 'checkpoints',
      title: 'Checkpoints and plans',
      body: [
        'Select **Generate checkpoints with AI** on a deadline or goal to create a draft plan. Each checkpoint has a measurable completion criterion, a date and, where relevant, dependencies. A feasibility check compares the plan with your available hours.',
        'A draft does not become your plan until you approve it. Before that you can:',
      ],
      bullets: [
        'Edit, reorder, remove and add checkpoints.',
        'Regenerate only the items you select. Your manual edits are protected.',
        'Approve the plan when you are happy with it.',
      ],
      image: { file: 'plan', alt: 'A draft plan with checkpoints, dates and a feasibility check' },
    },
    {
      id: 'goals',
      title: 'Goals',
      body: [
        'A goal can have a target date or none at all. Each goal shows its health, and you can log progress at any time. Choose how progress is measured:',
      ],
      bullets: [
        '**Done or not done**: a goal is either finished or not.',
        '**Percentage**: progress as a share of the whole.',
        '**Quantity**: a count toward a target number.',
        '**Time**: the time you have spent.',
        '**Checkpoints**: the share of plan checkpoints completed.',
        '**Weighted checkpoints**: checkpoints count according to the weight you give them.',
      ],
      image: { file: 'goals', alt: 'The Goals list with progress and health for each goal' },
    },
    {
      id: 'calendar-timeline',
      title: 'Calendar and timeline',
      body: [
        'The calendar shows month, week or day views. Exact deadlines, date-only deadlines, goal targets and checkpoints each have their own style, so you can tell them apart at a glance.',
        'Drag an item to reschedule it. Moving a deadline asks for confirmation first. The **Timeline** and **Gantt** views show how tasks and goals line up over time.',
      ],
      image: { file: 'calendar', alt: 'The calendar month view with deadlines, goal targets and checkpoints' },
    },
    {
      id: 'analytics',
      title: 'Analytics',
      body: [
        'Analytics are calculated from your own stored data. AI never changes the numbers.',
        'The activity calendar shows the days on which you completed something or logged progress.',
      ],
      image: { file: 'analytics', alt: 'The Analytics page with metrics and the activity calendar' },
    },
    {
      id: 'notifications',
      title: 'Reminders and notifications',
      body: [
        'Set reminders on deadlines and tasks: a preset such as one day or one hour before, a custom offset, or an exact time. Change notification settings in **Settings → Notifications**.',
        'Reminders can be delivered through these channels:',
      ],
      bullets: [
        '**In-app**: notifications inside TickPoint.',
        '**Browser push**: notifications from your browser.',
        '**Email**: sent to your Aryuki Accounts address once it is verified. You can add up to 5 more addresses; each is verified with a 6-digit code.',
        '**Quiet hours**: hold back notifications during the hours you choose.',
        'Send a test notification to check that each channel works.',
      ],
      image: { file: 'settings-notifications', alt: 'Notification settings with reminder presets and delivery channels' },
    },
    {
      id: 'mobile',
      title: 'TickPoint on your phone',
      body: [
        'On a phone, the bottom navigation opens the main sections, and the **+** button adds a task or deadline. Task lists have tabs at the top, and the filter sheet narrows what you see.',
        'To receive push notifications on an iPhone or iPad, add TickPoint to your Home Screen first.',
      ],
      images: [
        { file: 'mobile-overview', alt: 'The Overview page on a phone', mobile: true },
        { file: 'mobile-today', alt: 'The Today list on a phone', mobile: true },
      ],
    },
    {
      id: 'data-privacy',
      title: 'Your data',
      body: [
        'Export your data as JSON or CSV, import it again, and keep backups. In **Settings → Data** you can delete saved original texts, or delete all your TickPoint data. Deleting all data is permanent.',
      ],
    },
  ],
  ja: [
    {
      id: 'getting-started',
      title: 'はじめに',
      body: [
        'TickPoint は、締め切り、タスク、目標と、そこに至るまでのチェックポイントを落ち着いて管理するためのアプリです。**Aryuki アカウント** でサインインしてください。TickPoint がパスワードを知ることはありません。',
        '表示言語はブラウザの設定に従います。日本語が優先されていれば日本語、それ以外は英語で表示されます。言語はいつでも変更できます。',
      ],
      image: { file: 'overview', alt: '今日、締め切り、進行中の目標を表示した概要ページ' },
    },
    {
      id: 'overview',
      title: '概要ページ',
      body: ['概要ページは、作業の出発点です。いま大切なことを一目で確認できます。'],
      bullets: [
        '**今日**: 今日予定されている、または今日が締め切りのタスク。',
        '**まもなくの締め切り**: 残り時間をリアルタイムに示すカウントダウン付き。',
        '**要対応**: 期限切れや危険な状態のタスクと、その理由。',
        '**進行中の目標**と**最近の進捗**。',
        '**週間の数字**: 今週達成したことの概要。',
        '**クイックキャプチャ**: 一行でインボックスにタスクを追加できます。長く貼り付けたテキストは、スマートキャプチャに送れます。',
      ],
    },
    {
      id: 'inbox',
      title: 'インボックス、今日、今後、締め切り',
      body: [
        '**インボックス**は、まだ整理していないものを置く場所です。締め切り、プロジェクト、目標、親タスクのいずれも設定していないタスクが入ります。クイックキャプチャで追加したものなどです。定期的に見直してください。締め切り、プロジェクト、目標のどれかを設定すると、インボックスから移動します。',
        'そのほかのリストでは、期間ごとにタスクを確認できます。',
      ],
      bullets: [
        '**今日**: 今日予定されている、または今日が締め切りのタスクと、期限切れのタスク。',
        '**今後**: 今後14日間のタスク。',
        '**締め切り**: すべての厳密な締め切り。',
      ],
      image: { file: 'today', alt: '予定されたタスクと期限切れのタスクを表示した「今日」のリスト' },
    },
    {
      id: 'deadlines',
      title: '締め切りと精度',
      body: [
        'すべての締め切りには危険度が付きます。**順調**、**要注意**、**危険**、**期限切れ**のいずれかです。危険度は、残り時間、見積もりの作業量と使える時間の比較、進捗、遅れているチェックポイント、作業を止めている依存関係をもとに判断されます。カウントダウンのチップで残り時間をリアルタイムに確認できます。',
        '締め切りの精度は次の4種類から選びます。TickPoint は、わからない時刻を勝手に作ることはありません。',
      ],
      bullets: [
        '**日時を指定**: タイムゾーン付きで保存されます。TickPoint は、あなたのタイムゾーンと元のタイムゾーンの両方で時刻を表示します。',
        '**日付のみ**: その日が終わると期限切れになります。時刻は設定されません。',
        '**おおよそ**: 「来月初め」のような大まかな時期。',
        '**不明**: まだ日付がわかっていない締め切り。',
      ],
      image: { file: 'task-detail', alt: '締め切り、カウントダウン、危険度を表示したタスク詳細' },
    },
    {
      id: 'quick-add',
      title: 'クイック追加と検索',
      body: [
        '**Q** キーを押すと、タスクや締め切りを追加できます。スマートフォンでは **+** ボタンを押してください。**Ctrl/Cmd+K** で検索を開けます。',
      ],
    },
    {
      id: 'smart-capture',
      title: 'スマートキャプチャ',
      body: [
        'お知らせやメールを貼り付け、**AI で分析**を選びます（Google Gemini を使用）。内容を確認するまで、何も保存されません。**確定して作成**を押すまで保存されず、元のテキストを残すかどうかも選べます。',
      ],
      bullets: [
        '左側に元のテキストが表示され、各項目の根拠となる箇所がハイライトされます。',
        '右側に抽出された項目が表示されます。すべての項目は編集できます。',
        '**解釈**、または**原文に根拠が見つかりません**と表示された項目は、特に注意して確認してください。',
        'あいまいな点は、確認済みとして印を付けてください。',
      ],
      images: [
        { file: 'capture-paste', alt: '分析の準備ができたお知らせ文を貼り付けたスマートキャプチャ' },
        { file: 'capture-review', alt: '元のテキストと抽出された項目を並べて確認する画面' },
      ],
    },
    {
      id: 'checkpoints',
      title: 'チェックポイントと計画',
      body: [
        '締め切りや目標で **AI でチェックポイントを生成** を選ぶと、計画の下書きが作られます。各チェックポイントには、測定可能な完了条件、日付、必要に応じて依存関係が含まれます。利用可能な時間と照らし合わせた実現可能性も確認されます。',
        '下書きは、承認するまで正式な計画にはなりません。承認前に次のことができます。',
      ],
      bullets: [
        'チェックポイントを編集、並べ替え、削除、追加する。',
        '選んだ項目だけを再生成する。手で編集した内容は保護されます。',
        '内容に納得したら計画を承認する。',
      ],
      image: { file: 'plan', alt: '日付と実現可能性の確認を含む計画の下書き' },
    },
    {
      id: 'goals',
      title: '目標',
      body: [
        '目標には締め切りを設定することも、設定せずに続けることもできます。各目標には健全性が表示され、いつでも進捗を記録できます。進捗の測り方は次から選べます。',
      ],
      bullets: [
        '**完了/未完了**: 終わったかどうかで判断します。',
        '**割合**: 全体に対する割合で表します。',
        '**数量**: 目標の数に向けた件数で表します。',
        '**時間**: 費やした時間で表します。',
        '**チェックポイント**: 計画のチェックポイントのうち、完了した割合で表します。',
        '**重み付きチェックポイント**: チェックポイントごとに設定した重みに応じて進捗を計算します。',
      ],
      image: { file: 'goals', alt: '各目標の進捗と健全性を表示した目標一覧' },
    },
    {
      id: 'calendar-timeline',
      title: 'カレンダーとタイムライン',
      body: [
        'カレンダーは月、週、日の単位で表示できます。正確な締め切り、日付のみの締め切り、目標の期限、チェックポイントは、それぞれ異なるスタイルで表示されるため、一目で区別できます。',
        '項目をドラッグすると日程を変更できます。締め切りを移動するときは、確認が表示されます。**タイムライン**と**ガント**表示では、タスクと目標の時間的な関係を確認できます。',
      ],
      image: { file: 'calendar', alt: '締め切り、目標の期限、チェックポイントを表示したカレンダーの月表示' },
    },
    {
      id: 'analytics',
      title: '分析',
      body: [
        '分析の数値は、保存されたあなた自身のデータから計算されます。AI が数値を変更することはありません。',
        'アクティビティカレンダーには、何かを完了した日や進捗を記録した日が表示されます。',
      ],
      image: { file: 'analytics', alt: '指標とアクティビティカレンダーを表示した分析ページ' },
    },
    {
      id: 'notifications',
      title: 'リマインダーと通知',
      body: [
        '締め切りやタスクにリマインダーを設定できます。「1日前」や「1時間前」などのプリセット、任意の時間、特定の日時から選べます。通知の設定は **設定 → 通知** で変更できます。',
        'リマインダーは次の方法で届けられます。',
      ],
      bullets: [
        '**アプリ内**: TickPoint の中に表示される通知。',
        '**ブラウザのプッシュ通知**: ブラウザから届く通知。',
        '**メール**: Aryuki アカウントのメールアドレスが確認済みであれば、そこに届きます。さらに最大5件まで追加でき、それぞれ6桁のコードで確認します。',
        '**おやすみ時間**: 指定した時間帯は通知を控えます。',
        'テスト通知を送って、各チャンネルが動作するか確認できます。',
      ],
      image: { file: 'settings-notifications', alt: 'リマインダーのプリセットと通知チャンネルを表示した通知設定' },
    },
    {
      id: 'mobile',
      title: 'スマートフォンで使う',
      body: [
        'スマートフォンでは、下部のナビゲーションから主要な画面を開けます。**+** ボタンでタスクや締め切りを追加できます。タスクの一覧は上部のタブで切り替わり、フィルターシートで表示を絞り込めます。',
        'iPhone や iPad でプッシュ通知を受け取るには、先に TickPoint をホーム画面に追加してください。',
      ],
      images: [
        { file: 'mobile-overview', alt: 'スマートフォンで表示した概要ページ', mobile: true },
        { file: 'mobile-today', alt: 'スマートフォンで表示した「今日」のリスト', mobile: true },
      ],
    },
    {
      id: 'data-privacy',
      title: 'データとプライバシー',
      body: [
        '**設定 → データ** から、データを JSON または CSV で書き出せます。書き出したデータは取り込み直すこともでき、バックアップも作成できます。保存した元のテキストを削除することも、TickPoint のすべてのデータを削除することもできます。すべてのデータの削除は元に戻せません。',
      ],
    },
  ],
}

/** Split text on ** markers into plain and bold runs. Rendered with text interpolation, never v-html. */
export function boldParts(text: string): { text: string; bold: boolean }[] {
  return text
    .split('**')
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
    .filter((part) => part.text !== '')
}
