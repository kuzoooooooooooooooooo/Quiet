import { useState } from 'react';
import { t } from './i18n';
import type { Language } from './i18n';
import { Icon } from './Icon';
import type { Theme } from './theme';
import { backgroundGroups, backgroundLabels } from './background';
import type { Background } from './background';
import type { Preferences } from './preferences';
import type { useUpdater } from './useUpdater';
import UpdateSettings from './UpdateSettings';
export type SettingsSection = 'general' | 'appearance' | 'editor' | 'keyboard' | 'updates';
export function KeyboardShortcuts() {
  return (
    <>
      {' '}
      <div className="shortcut-row">
        <span>{t('Згорнути / розгорнути бічну панель')}</span>
        <span>
          <kbd>Ctrl / ⌘</kbd> <kbd>\</kbd>
        </span>
      </div>
      <div className="shortcut-row">
        <span>{t('Пошук у workspace')}</span>
        <span>
          <kbd>Ctrl / ⌘</kbd> <kbd>K</kbd>
        </span>
      </div>
      <div className="shortcut-row">
        <span>{t('Навігація результатами пошуку')}</span>
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd>
        </span>
      </div>
      <div className="shortcut-row">
        <span>{t('Відкрити результат / додати завдання')}</span>
        <kbd>Enter</kbd>
      </div>
      <div className="shortcut-row">
        <span>{t('Закрити вікно')}</span>
        <kbd>Esc</kbd>
      </div>
      <div className="shortcut-row">
        <span>{t('Перейти до наступного елемента')}</span>
        <kbd>Tab</kbd>
      </div>
    </>
  );
}
export default function Settings({
  initialSection = 'general',
  theme,
  selectTheme,
  background,
  selectBackground,
  language,
  selectLanguage,
  preferences,
  savePreferences,
  updater,
  notify: setNotification,
}: {
  initialSection?: SettingsSection;
  theme: Theme;
  selectTheme: (value: Theme) => boolean;
  background: Background;
  selectBackground: (value: Background) => boolean;
  language: Language;
  selectLanguage: (value: Language) => boolean;
  preferences: Preferences;
  savePreferences: (patch: Partial<Preferences>) => void;
  updater: ReturnType<typeof useUpdater>;
  notify: (text: string) => void;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const sections = [
    { id: 'general', label: t('Загальні'), icon: 'settings' },
    { id: 'appearance', label: t('Персоналізація'), icon: 'sun' },
    { id: 'editor', label: t('Редактор'), icon: 'edit' },
    { id: 'keyboard', label: t('Клавіатурні скорочення'), icon: 'keyboard' },
    { id: 'updates', label: t('Оновлення'), icon: 'download' },
  ] as const;
  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label={t('Розділи налаштувань')}>
        {sections.map((item) => (
          <button
            key={item.id}
            data-section={item.id}
            aria-current={section === item.id ? 'page' : undefined}
            onClick={() => setSection(item.id)}
          >
            <Icon name={item.icon} size={16} />
            {item.label}
          </button>
        ))}
      </nav>
      <section
        className="settings-panel"
        aria-label={sections.find((item) => item.id === section)!.label}
      >
        {section === 'general' && (
          <>
            {' '}
            <label className="language-setting">
              <span className="language-setting-label">
                <Icon name="globe" size={19} />
                <span>{t('Мова')}</span>
              </span>
              <select
                aria-label={t('Мова')}
                value={language}
                onChange={(event) => {
                  if (!selectLanguage(event.target.value as Language))
                    setNotification(t('Мову застосовано, але зберегти вибір не вдалося.'));
                }}
              >
                <option value="uk">Українська</option>
                <option value="en">English</option>
              </select>
            </label>
            <fieldset className="behavior-settings">
              <legend>{t('Нотатки')}</legend>
              <label>
                <input
                  type="checkbox"
                  checked={preferences.showNotes}
                  onChange={(e) => savePreferences({ showNotes: e.target.checked })}
                />
                <span>{t('Показувати загальні нотатки')}</span>
              </label>
            </fieldset>
          </>
        )}
        {section === 'appearance' && (
          <>
            {' '}
            <fieldset className="theme-picker">
              <legend>{t('Вигляд')}</legend>
              <div className="theme-options">
                {(
                  [
                    { value: 'light', label: t('Світла'), icon: 'sun' },
                    { value: 'dark', label: t('Темна'), icon: 'moon' },
                    { value: 'system', label: t('Системна'), icon: 'monitor' },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className={`theme-option ${theme === option.value ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={option.value}
                      checked={theme === option.value}
                      onChange={() => {
                        if (!selectTheme(option.value as Theme))
                          setNotification(
                            t('Тему застосовано, але зберегти вибір на пристрої не вдалося.'),
                          );
                      }}
                    />
                    <span className={`theme-preview ${option.value}`} aria-hidden="true">
                      <span className="preview-sidebar" />
                      <span className="preview-content">
                        <i />
                        <i />
                        <i />
                      </span>
                    </span>
                    <span className="theme-option-label">
                      <Icon name={option.icon} size={15} />
                      <span>{option.label}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="background-picker">
              <legend>{t('Фон')}</legend>
              {backgroundGroups.map((group) => (
                <section className="background-group" key={group.label} aria-label={t(group.label)}>
                  <h3>{t(group.label)}</h3>{' '}
                  <div className="background-options">
                    {group.values.map((value) => (
                      <label
                        key={value}
                        className={`background-option ${background === value ? 'selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="background"
                          value={value}
                          checked={background === value}
                          onChange={() => {
                            if (!selectBackground(value))
                              setNotification(t('Не вдалося зберегти фон.'));
                          }}
                        />
                        <span
                          className={`background-swatch background-${value}`}
                          data-wallpaper={value}
                          aria-hidden="true"
                        />
                        <span>{t(backgroundLabels[value])}</span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </fieldset>
          </>
        )}
        {section === 'editor' && (
          <>
            {' '}
            <fieldset className="behavior-settings">
              <legend>{t('Редактор')}</legend>
              <label>
                <input
                  type="checkbox"
                  checked={preferences.autoFormat}
                  onChange={(e) => savePreferences({ autoFormat: e.target.checked })}
                />
                <span>{t('Автоформатування тексту')}</span>
              </label>
              <small>{t('Перетворювати #, -, 1. і ** під час введення.')}</small>
            </fieldset>
          </>
        )}
        {section === 'keyboard' && <KeyboardShortcuts />}
        {section === 'updates' && <UpdateSettings updater={updater} />}
      </section>
    </div>
  );
}
