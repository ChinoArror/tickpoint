// Draft for review: this Terms of Service text is a first version written for the owner's legal review.
// Effective date = TERMS_VERSION (src/shared/constants.ts). Do not publish without review.
// Rendered like privacy.ts: text only, **bold** markers supported, never v-html.

import type { PolicySection } from './privacy'

export const terms: Record<'en' | 'ja', PolicySection[]> = {
  en: [
    {
      id: 'operator',
      title: 'Who provides TickPoint',
      body: [
        'TickPoint (https://point.aryuki.com) is operated by Aryuki. By creating an account or using TickPoint, you agree to these Terms of Service and to the Privacy Policy. If you do not agree, please do not use TickPoint.',
      ],
    },
    {
      id: 'accounts',
      title: 'Your account',
      body: [
        'You sign in with an Aryuki account managed by Aryuki Accounts (https://accounts.aryuki.com). TickPoint does not store your password.',
        'You are responsible for keeping your sign-in secure and for activity that happens under your account. Tell us as soon as you notice unauthorized use.',
      ],
    },
    {
      id: 'service',
      title: 'The service and changes to it',
      body: [
        'TickPoint helps you plan deadlines, goals, checkpoints and progress. It includes reminders by in-app notification, email and browser or Android push, AI-assisted capture and drafts, activity history, and data export, import and backups.',
        'TickPoint is free to use. We may add, change or remove features at any time. We may also end the service, in which case we will try to give you reasonable notice and a way to export your data.',
        'An Android app is planned. We do not guarantee a release date for it.',
      ],
    },
    {
      id: 'content',
      title: 'Your content',
      body: [
        'You own the content you add to TickPoint, such as tasks, deadlines, goals, notes, texts you save, attachments and backups (together, **your content**).',
        'You give us a limited licence to host, store, back up, process and display your content only so that we can provide TickPoint to you. We do not use your content for advertising and do not sell it.',
        'You can export your data as JSON or CSV, and delete all your TickPoint data at any time in **Settings → Data**. Deletion is permanent.',
      ],
    },
    {
      id: 'ai',
      title: 'AI features',
      body: [
        'AI features, such as Smart Capture and checkpoint generation, produce drafts. Drafts can be wrong, incomplete or out of date. Review every draft before you save it or act on it. You are responsible for the decisions you make based on your content and any AI output.',
        'Only send text you have the right to use. AI features are subject to usage limits, which are managed through Aryuki Accounts. Text you send is processed by the Google Gemini API as described in the Privacy Policy. You can turn AI features off in **Settings → AI**.',
      ],
    },
    {
      id: 'reminders',
      title: 'Reminders and notifications',
      body: [
        'Reminders are sent on a best-effort basis. Email, browser push and Android push notifications can be delayed, filtered, blocked or not delivered, for example because of your device, browser or network settings, or because of third-party services.',
        'Do not rely on TickPoint as the only record of critical deadlines. Keep your own reminders for anything that matters.',
      ],
    },
    {
      id: 'acceptable-use',
      title: 'Acceptable use',
      body: ['You agree not to use TickPoint:'],
      bullets: [
        'for any unlawful purpose, or in a way that infringes the rights of others',
        'to send spam or unsolicited messages, or to harass other people',
        'to scrape, crawl or access the service in bulk by automated means, beyond normal use of the app',
        'to attack, probe, overload or reverse engineer the service, except where the law allows it',
        'to upload malicious code, or to bypass usage limits, access controls or rate limits',
      ],
    },
    {
      id: 'availability',
      title: 'Availability and disclaimer',
      body: [
        'TickPoint is provided "as is" and "as available". To the extent permitted by law, we make no warranties of any kind, express or implied, including that the service will be uninterrupted, error-free or permanently available.',
        'Backups in TickPoint are a convenience. Keep your own copies of important data.',
      ],
    },
    {
      id: 'liability',
      title: 'Limitation of liability',
      body: [
        'To the extent permitted by law, Aryuki is not liable for indirect, incidental, special or consequential losses arising from your use of TickPoint, including missed deadlines, lost data or lost opportunities.',
        'Nothing in these terms limits any liability that cannot be limited under applicable law.',
      ],
    },
    {
      id: 'termination',
      title: 'Suspension and termination',
      body: [
        'You can stop using TickPoint at any time. You can sign out, and you can delete all your TickPoint data in **Settings → Data**. Deleting your Aryuki account is handled by Aryuki Accounts.',
        'We may suspend or end access for accounts that break these terms, or where needed to protect the service or other users. Where practical, we will tell you before doing so.',
      ],
    },
    {
      id: 'changes',
      title: 'Changes to these terms',
      body: [
        'We may update these terms. When we do, we will change the effective date shown on this page and show material changes in the app before they apply.',
        'On the web, the updated terms apply from the effective date. In the Android app, you may be asked to accept the new version before you continue.',
      ],
    },
    {
      id: 'privacy',
      title: 'Privacy Policy',
      body: [
        'How we collect, use and store personal information is described in the Privacy Policy at https://point.aryuki.com/privacy. The Privacy Policy is part of these terms.',
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      body: [
        'For questions about these terms, use the support options of Aryuki Accounts at https://accounts.aryuki.com.',
      ],
    },
  ],
  ja: [
    {
      id: 'operator',
      title: 'TickPoint の提供者',
      body: [
        'TickPoint（https://point.aryuki.com）は Aryuki が運営しています。アカウントを作成するか TickPoint を利用すると、この利用規約とプライバシーポリシーに同意したものとみなされます。同意いただけない場合は、TickPoint をご利用にならないでください。',
      ],
    },
    {
      id: 'accounts',
      title: 'アカウント',
      body: [
        'Aryuki アカウント（https://accounts.aryuki.com）で、Aryuki Accounts が管理するアカウントを使ってサインインします。TickPoint がパスワードを保存することはありません。',
        'サインインの安全を保つことと、アカウントで行われた操作については、あなたに責任があります。不正な利用に気づいたら、すぐにご連絡ください。',
      ],
    },
    {
      id: 'service',
      title: 'サービスと、その変更',
      body: [
        'TickPoint は、締め切り、目標、チェックポイント、進捗の計画を支援するサービスです。アプリ内通知、メール、ブラウザや Android のプッシュ通知によるリマインダー、AI を使ったキャプチャと下書き、変更履歴、データの書き出し・読み込み・バックアップなどを含みます。',
        'TickPoint は無料でご利用いただけます。機能は、いつでも追加、変更、削除することがあります。サービスを終了する場合は、合理的な期間をおいて事前にお知らせし、データを書き出せるようにします。',
        'Android アプリは提供を予定しています。提供時期は保証しません。',
      ],
    },
    {
      id: 'content',
      title: 'あなたのコンテンツ',
      body: [
        'TickPoint に追加するタスク、締め切り、目標、メモ、保存したテキスト、添付ファイル、バックアップなどの内容（以下「あなたのコンテンツ」）の権利は、あなたに帰属します。',
        'あなたのコンテンツを、TickPoint をあなたに提供するためにのみ、ホスティング、保存、バックアップ、処理、表示する限定的な許諾をいただきます。あなたのコンテンツを広告に利用することも、販売することもありません。',
        'データは JSON または CSV で書き出せます。**設定 → データ** から、TickPoint のすべてのデータをいつでも削除できます。削除は元に戻せません。',
      ],
    },
    {
      id: 'ai',
      title: 'AI 機能',
      body: [
        'スマートキャプチャやチェックポイントの生成などの AI 機能は、下書きを作成します。下書きには誤りや不足、古い情報が含まれることがあります。保存する前や、下書きに基づいて行動する前に、必ず内容を確認してください。あなたのコンテンツや AI の出力に基づいて行う判断は、あなたの責任となります。',
        '利用する権利のあるテキストだけを送信してください。AI 機能には利用上限があり、Aryuki アカウントで管理されます。送信されたテキストは、プライバシーポリシーに記載のとおり Google Gemini API で処理されます。**設定 → AI** で AI 機能をオフにできます。',
      ],
    },
    {
      id: 'reminders',
      title: 'リマインダーと通知',
      body: [
        'リマインダーは、ベストエフォートで送信されます。メール、ブラウザのプッシュ通知、Android のプッシュ通知は、端末やブラウザの設定、ネットワーク、第三者のサービスなどの理由で、遅れたり、制限されたり、届かなかったりすることがあります。',
        '重要な締め切りについて、TickPoint だけを唯一の記録にしないでください。大切な予定は、ご自身でもリマインダーを設定してください。',
      ],
    },
    {
      id: 'acceptable-use',
      title: '利用上の禁止事項',
      body: ['次の行為を行わないでください。'],
      bullets: [
        '法令に違反する目的での利用、または他者の権利を侵害する利用',
        'スパムや迷惑なメッセージの送信、他の人への嫌がらせ',
        '通常のアプリ利用の範囲を超えて、自動的な手段で大量にデータを収集したり、アクセスしたりすること',
        'サービスへの攻撃、探索、過剰な負荷の発生、法律で認められる場合を除くリバースエンジニアリング',
        '悪意のあるコードのアップロード、または利用上限、アクセス制御、レート制限の回避',
      ],
    },
    {
      id: 'availability',
      title: '提供の状態と免責',
      body: [
        'TickPoint は「現状有姿」かつ「提供可能な範囲で」提供されます。法律で認められる範囲で、サービスが中断しないこと、誤りがないこと、永続的に利用できることを含め、明示または黙示を問わず、いかなる保証も行いません。',
        'TickPoint のバックアップは利便性のための機能です。大切なデータは、ご自身でもコピーを保管してください。',
      ],
    },
    {
      id: 'liability',
      title: '責任の制限',
      body: [
        '法律で認められる範囲で、TickPoint の利用により生じた間接的、付随的、特別な損害や結果的損害（締め切りの見落とし、データの損失、機会の損失などを含みます）について、Aryuki は責任を負いません。',
        'この規約のいかなる内容も、適用される法律により制限できない責任を制限するものではありません。',
      ],
    },
    {
      id: 'termination',
      title: '利用の停止と終了',
      body: [
        'TickPoint の利用はいつでも終了できます。サインアウトすることも、**設定 → データ** から TickPoint のすべてのデータを削除することもできます。Aryuki アカウントの削除は、Aryuki Accounts で行われます。',
        'この規約に違反したアカウント、またはサービスや他の利用者を守るために必要な場合、アクセスを停止または終了することがあります。可能な場合は、事前にお知らせします。',
      ],
    },
    {
      id: 'changes',
      title: 'この規約の変更',
      body: [
        'この規約を更新することがあります。更新した場合は、このページに記載の施行日を変更し、重要な変更は適用前にアプリ内で表示します。',
        'Web 版では、施行日から更新後の規約が適用されます。Android アプリでは、利用を続ける前に新しい規約への同意を求めることがあります。',
      ],
    },
    {
      id: 'privacy',
      title: 'プライバシーポリシー',
      body: [
        '個人情報の取得、利用、保存については、プライバシーポリシー（https://point.aryuki.com/privacy）に記載しています。プライバシーポリシーは、この規約の一部です。',
      ],
    },
    {
      id: 'contact',
      title: 'お問い合わせ',
      body: [
        'この規約に関するご質問は、Aryuki アカウント（https://accounts.aryuki.com）のサポート窓口をご利用ください。',
      ],
    },
  ],
}
