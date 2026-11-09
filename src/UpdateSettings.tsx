import { t } from './i18n';
import type { useUpdater } from './useUpdater';
import { version } from '../package.json';

export default function UpdateSettings({ updater }: { updater: ReturnType<typeof useUpdater> }) {
  const canInstall =
    !!updater.version && (updater.phase === 'available' || updater.phase === 'error');
  return (
    <section className="update-settings" aria-label={t('Оновлення')}>
      <div className="update-heading">
        <strong>{t('Оновлення')}</strong>
        <span>Quiet {version}</span>
      </div>
      <p role="status" aria-live="polite">
        {updater.support === 'browser'
          ? t('Оновлення доступні у Windows-додатку.')
          : updater.support === 'unconfigured'
            ? t('Ця збірка не налаштована для оновлень.')
            : updater.phase === 'checking'
              ? t('Перевіряємо оновлення…')
              : updater.phase === 'downloading'
                ? `${t('Завантажуємо оновлення…')}${updater.progress === null ? '' : ` ${updater.progress}%`}`
                : updater.phase === 'installing'
                  ? t('Зберігаємо зміни та встановлюємо оновлення…')
                  : updater.phase === 'installed'
                    ? t('Оновлення встановлено. Запусти Quiet знову.')
                    : updater.phase === 'error'
                      ? t('Не вдалося завершити оновлення. Спробуй знову.')
                      : updater.phase === 'current'
                        ? t('Встановлено найновішу версію.')
                        : updater.version
                          ? t('Доступна версія {version}.', { version: updater.version })
                          : ''}
      </p>
      {updater.error && (
        <details className="update-details">
          <summary>{t('Деталі')}</summary>
          <p>{updater.error}</p>
        </details>
      )}
      {updater.phase === 'downloading' && (
        <progress
          aria-label={t('Завантажуємо оновлення…')}
          max={100}
          value={updater.progress ?? undefined}
        />
      )}
      {canInstall && <p>{t('Після збереження змін додаток перезапуститься.')}</p>}
      {updater.support !== 'browser' &&
        updater.support !== 'unconfigured' &&
        updater.phase !== 'installed' && (
          <button
            className="button secondary"
            disabled={updater.busy}
            onClick={() => void (canInstall ? updater.install() : updater.check())}
          >
            {canInstall ? t('Завантажити та встановити') : t('Перевірити оновлення')}
          </button>
        )}
    </section>
  );
}
