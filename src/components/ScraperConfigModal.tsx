'use client';

import React, { useState } from 'react';
import { ScraperRenderMode, FieldExtractionRule } from '../lib/types/scraper';
import { X, Play, Save, Plus, Trash2, Code, Sliders, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react';

interface ScraperConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialConfig?: any;
}

const DEFAULT_FIELDS: Record<string, FieldExtractionRule> = {
  externalId: { selector: '.tender-id, [data-id]', attr: 'text', transform: 'trim' },
  title: { selector: '.tender-title, h3, a.title', attr: 'text', transform: 'trim' },
  detailUrl: { selector: 'a.tender-link, a[href*="tender"]', attr: 'href', transform: 'absoluteUrl' },
  amount: { selector: '.tender-price, .amount', attr: 'text', transform: 'parseAmountKzt' },
  customerName: { selector: '.customer-name, .company', attr: 'text', transform: 'trim' },
  deadlineDate: { selector: '.deadline, .date', attr: 'text', transform: 'parseDateRu' }
};

export const ScraperConfigModal: React.FC<ScraperConfigModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  initialConfig
}) => {
  const [name, setName] = useState<string>(initialConfig?.dataSource?.name || 'B2B_PRIVATE');
  const [displayName, setDisplayName] = useState<string>(initialConfig?.dataSource?.displayName || 'Частная B2B-площадка');
  const [renderMode, setRenderMode] = useState<ScraperRenderMode>(initialConfig?.renderMode || 'STATIC');
  const [listUrlTemplate, setListUrlTemplate] = useState<string>(initialConfig?.listUrlTemplate || 'https://example-tenders.kz/list?page={page}');
  const [startPage, setStartPage] = useState<number>(initialConfig?.pagination?.startPage || 1);
  const [maxPages, setMaxPages] = useState<number>(initialConfig?.pagination?.maxPages || 3);
  const [listItemSelector, setListItemSelector] = useState<string>(initialConfig?.listItemSelector || '.tender-item');
  const [respectRobotsTxt, setRespectRobotsTxt] = useState<boolean>(initialConfig?.respectRobotsTxt !== false);
  const [active, setActive] = useState<boolean>(initialConfig?.active !== false);
  const [checkIntervalMins, setCheckIntervalMins] = useState<number>(initialConfig?.dataSource?.checkIntervalMins || 30);

  const [fieldRows, setFieldRows] = useState<Array<{ name: string; rule: FieldExtractionRule }>>(() => {
    const fields = initialConfig?.fields || DEFAULT_FIELDS;
    return Object.entries(fields).map(([k, v]: [string, any]) => ({
      name: k,
      rule: {
        selector: String(v?.selector || ''),
        attr: (v?.attr || 'text') as any,
        transform: (v?.transform || 'trim') as any,
        transformParam: v?.transformParam ? String(v.transformParam) : undefined
      }
    }));
  });

  const [rawJsonMode, setRawJsonMode] = useState<boolean>(false);
  const [jsonText, setJsonText] = useState<string>('');

  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddField = () => {
    setFieldRows([...fieldRows, { name: `field_${fieldRows.length + 1}`, rule: { selector: '', attr: 'text', transform: 'trim' } }]);
  };

  const handleRemoveField = (index: number) => {
    setFieldRows(fieldRows.filter((_, idx) => idx !== index));
  };

  const handleFieldChange = (index: number, key: 'name' | 'selector' | 'attr' | 'transform' | 'transformParam', value: string) => {
    const next = [...fieldRows];
    if (key === 'name') {
      next[index].name = value;
    } else {
      next[index].rule = {
        ...next[index].rule,
        [key]: value || undefined
      };
    }
    setFieldRows(next);
  };

  const buildFieldsObject = (): Record<string, FieldExtractionRule> => {
    if (rawJsonMode && jsonText) {
      try {
        const parsed = JSON.parse(jsonText);
        return parsed.fields || parsed;
      } catch {
      }
    }
    const res: Record<string, FieldExtractionRule> = {};
    for (const item of fieldRows) {
      if (item.name.trim() && item.rule.selector.trim()) {
        res[item.name.trim()] = item.rule;
      }
    }
    return res;
  };

  const toggleJsonMode = () => {
    if (!rawJsonMode) {
      const fullObj = {
        name,
        displayName,
        renderMode,
        listUrlTemplate,
        pagination: { startPage, maxPages },
        listItemSelector,
        fields: buildFieldsObject(),
        respectRobotsTxt,
        active
      };
      setJsonText(JSON.stringify(fullObj, null, 2));
    }
    setRawJsonMode(!rawJsonMode);
  };

  const handleTestScraper = async () => {
    setTesting(true);
    setTestResult(null);
    setErrorMsg(null);

    const fields = buildFieldsObject();
    const payload = {
      listUrlTemplate,
      renderMode,
      listItemSelector,
      fields,
      respectRobotsTxt
    };

    try {
      const res = await fetch('/api/admin/scraper-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setErrorMsg(`Сбой выполнения теста: ${err?.message || 'Сетевая ошибка'}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setErrorMsg(null);

    let fields = buildFieldsObject();
    if (rawJsonMode && jsonText) {
      try {
        const parsed = JSON.parse(jsonText);
        fields = parsed.fields || fields;
      } catch (err: any) {
        setErrorMsg(`Ошибка синтаксиса JSON: ${err?.message}`);
        setSaving(false);
        return;
      }
    }

    const payload = {
      name,
      displayName,
      renderMode,
      listUrlTemplate,
      pagination: { startPage, maxPages, stopOnEmpty: true },
      listItemSelector,
      fields,
      respectRobotsTxt,
      active,
      checkIntervalMins
    };

    try {
      const res = await fetch('/api/admin/scraper-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        onSaved();
        onClose();
      } else {
        setErrorMsg(data.message || 'Ошибка сохранения конфигурации');
      }
    } catch (err: any) {
      setErrorMsg(`Сбой при сохранении: ${err?.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-paper border border-hairline rounded-3xl shadow-elevated flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-hairline flex items-center justify-between bg-surface-alt">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-paper border border-hairline text-ink shadow-subtle">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink tracking-tight">Конфигуратор Scraper-источника</h2>
              <p className="text-xs text-mid-gray">Настройка универсального парсинга HTML/JS без изменения кода</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleJsonMode}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-subtle ${
                rawJsonMode ? 'bg-ink text-paper border-ink' : 'bg-paper border-hairline text-ink hover:bg-surface-alt'
              }`}
            >
              <Code className="w-4 h-4" />
              <span>{rawJsonMode ? 'Форма UI' : 'JSON Редактор'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-mid-gray hover:text-ink hover:bg-paper transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">

          {errorMsg && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
              <div>
                <p className="font-semibold">Ошибка выполнения</p>
                <p className="text-xs text-red-700">{errorMsg}</p>
              </div>
            </div>
          )}

          {rawJsonMode ? (
            <div className="space-y-2">
              <label className="text-ink font-semibold block">JSON Конфигурация источника:</label>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                rows={18}
                className="w-full p-4 rounded-2xl bg-surface-alt border border-hairline font-mono text-xs text-ink focus:outline-none focus:border-ink shadow-subtle"
              />
            </div>
          ) : (
            <>
              {/* General Config Block */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-surface-alt border border-hairline shadow-subtle">
                <div>
                  <label className="text-mid-gray font-semibold block mb-1">Идентификатор источника (System ID)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="B2B_PRIVATE_KZ"
                    className="w-full px-3 py-2 rounded-xl bg-paper border border-hairline text-ink focus:border-ink focus:outline-none shadow-subtle"
                  />
                </div>

                <div>
                  <label className="text-mid-gray font-semibold block mb-1">Отображаемое имя (Display Name)</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Евразийская торговая система (ETS.kz)"
                    className="w-full px-3 py-2 rounded-xl bg-paper border border-hairline text-ink focus:border-ink focus:outline-none shadow-subtle"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-mid-gray font-semibold block mb-1">Шаблон URL списка лотов (с плейсхолдером {'{page}'})</label>
                  <input
                    type="text"
                    value={listUrlTemplate}
                    onChange={(e) => setListUrlTemplate(e.target.value)}
                    placeholder="https://example.kz/tenders?page={page}"
                    className="w-full px-3 py-2 rounded-xl bg-paper border border-hairline text-ink font-mono focus:border-ink focus:outline-none shadow-subtle"
                  />
                </div>

                <div>
                  <label className="text-mid-gray font-semibold block mb-1">Режим рендеринга HTML (renderMode)</label>
                  <div className="flex items-center space-x-3 mt-1">
                    <button
                      type="button"
                      onClick={() => setRenderMode('STATIC')}
                      className={`flex-1 py-2 rounded-xl border font-semibold text-center transition-all shadow-subtle ${
                        renderMode === 'STATIC' ? 'bg-ink text-paper border-ink' : 'bg-paper border-hairline text-mid-gray hover:text-ink'
                      }`}
                    >
                      STATIC (Обычный HTML)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenderMode('JS_RENDERED')}
                      className={`flex-1 py-2 rounded-xl border font-semibold text-center transition-all shadow-subtle ${
                        renderMode === 'JS_RENDERED' ? 'bg-ink text-paper border-ink' : 'bg-paper border-hairline text-mid-gray hover:text-ink'
                      }`}
                    >
                      JS_RENDERED (Chromium)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-mid-gray font-semibold block mb-1">CSS-селектор карточки лота (listItemSelector)</label>
                  <input
                    type="text"
                    value={listItemSelector}
                    onChange={(e) => setListItemSelector(e.target.value)}
                    placeholder=".tender-card, tr.tender-row"
                    className="w-full px-3 py-2 rounded-xl bg-paper border border-hairline text-ink font-mono focus:border-ink focus:outline-none shadow-subtle"
                  />
                </div>

                <div className="flex items-center space-x-4">
                  <div>
                    <label className="text-mid-gray font-semibold block mb-1">Стартовая стр.</label>
                    <input
                      type="number"
                      value={startPage}
                      onChange={(e) => setStartPage(Number(e.target.value))}
                      className="w-20 px-3 py-2 rounded-xl bg-paper border border-hairline text-ink text-center font-mono focus:outline-none shadow-subtle"
                    />
                  </div>
                  <div>
                    <label className="text-mid-gray font-semibold block mb-1">Макс. страниц</label>
                    <input
                      type="number"
                      value={maxPages}
                      onChange={(e) => setMaxPages(Number(e.target.value))}
                      className="w-20 px-3 py-2 rounded-xl bg-paper border border-hairline text-ink text-center font-mono focus:outline-none shadow-subtle"
                    />
                  </div>
                  <div>
                    <label className="text-mid-gray font-semibold block mb-1">Интервал (мин)</label>
                    <input
                      type="number"
                      value={checkIntervalMins}
                      onChange={(e) => setCheckIntervalMins(Number(e.target.value))}
                      className="w-24 px-3 py-2 rounded-xl bg-paper border border-hairline text-ink text-center font-mono focus:outline-none shadow-subtle"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-6 pt-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={respectRobotsTxt}
                      onChange={(e) => setRespectRobotsTxt(e.target.checked)}
                      className="w-4 h-4 rounded border-hairline text-ink focus:ring-0"
                    />
                    <span className="text-ink font-medium">Соблюдать robots.txt</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                      className="w-4 h-4 rounded border-hairline text-ink focus:ring-0"
                    />
                    <span className="text-ink font-medium">Источник активен</span>
                  </label>
                </div>
              </div>

              {/* Fields Extraction Rules Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                    Словарь правил извлечения полей (Fields Mapping)
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddField}
                    className="px-3 py-1.5 rounded-xl bg-surface-alt hover:bg-paper border border-hairline text-ink font-semibold flex items-center space-x-1.5 transition-all shadow-subtle"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить поле</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {fieldRows.map((row, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center p-2.5 rounded-xl bg-surface-alt border border-hairline shadow-subtle">
                      <div className="col-span-3">
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => handleFieldChange(index, 'name', e.target.value)}
                          placeholder="Имя поля (title, amount...)"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-paper border border-hairline text-ink font-mono text-xs focus:border-ink focus:outline-none"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="text"
                          value={row.rule.selector}
                          onChange={(e) => handleFieldChange(index, 'selector', e.target.value)}
                          placeholder="CSS Selector (.title, td.price)"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-paper border border-hairline text-ink font-mono text-xs focus:border-ink focus:outline-none"
                        />
                      </div>
                      <div className="col-span-2">
                        <select
                          value={row.rule.attr || 'text'}
                          onChange={(e) => handleFieldChange(index, 'attr', e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg bg-paper border border-hairline text-ink text-xs focus:outline-none"
                        >
                          <option value="text">text</option>
                          <option value="html">html</option>
                          <option value="href">href</option>
                          <option value="title">title</option>
                          <option value="src">src</option>
                          <option value="data-id">data-id</option>
                        </select>
                      </div>
                      <div className="col-span-3">
                        <select
                          value={row.rule.transform || 'trim'}
                          onChange={(e) => handleFieldChange(index, 'transform', e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg bg-paper border border-hairline text-ink text-xs focus:outline-none"
                        >
                          <option value="trim">trim</option>
                          <option value="stripHtml">stripHtml</option>
                          <option value="absoluteUrl">absoluteUrl</option>
                          <option value="parseAmountKzt">parseAmountKzt</option>
                          <option value="parseDateRu">parseDateRu</option>
                          <option value="parseDateISO">parseDateISO</option>
                          <option value="regexExtract">regexExtract</option>
                        </select>
                      </div>
                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveField(index)}
                          className="p-1.5 rounded-lg text-mid-gray hover:text-ember hover:bg-paper transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Test & Preview Panel */}
          {testResult && (
            <div className="p-4 rounded-2xl bg-surface-alt border border-hairline space-y-3 animate-fadeIn shadow-subtle">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-ink flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Результат тестового обхода (Предпросмотр)</span>
                </h4>
                <span className="text-mid-gray font-mono text-[11px]">
                  Найдено: <strong className="text-ink">{testResult.itemsFound}</strong> лотов &bull; Время: {testResult.durationMs}ms
                </span>
              </div>

              {testResult.warnings && testResult.warnings.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] space-y-1">
                  {testResult.warnings.map((w: string, idx: number) => (
                    <p key={idx} className="flex items-center space-x-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      <span>{w}</span>
                    </p>
                  ))}
                </div>
              )}

              {testResult.sampleTenders && testResult.sampleTenders.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-mid-gray font-medium text-[11px]">Первые распарсенные тендеры:</p>
                  <div className="grid grid-cols-1 gap-2">
                    {testResult.sampleTenders.map((t: any, i: number) => (
                      <div key={i} className="p-3 rounded-xl bg-paper border border-hairline text-xs space-y-1 font-mono shadow-subtle">
                        <div className="flex items-center justify-between text-ink">
                          <span className="font-bold">{t.externalId}</span>
                          <span className="font-bold">{t.amount?.toLocaleString('ru-RU')} ₸</span>
                        </div>
                        <p className="text-ink-soft font-sans font-medium line-clamp-1">{t.title}</p>
                        <div className="flex items-center justify-between text-[10px] text-mid-gray font-sans pt-1">
                          <span>Заказчик: {t.customerName}</span>
                          <span>Дедлайн: {t.deadlineDate ? new Date(t.deadlineDate).toLocaleDateString('ru-RU') : 'N/A'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-mid-gray italic">Элементы не найдены. Проверьте правильность CSS-селекторов.</p>
              )}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-hairline bg-surface-alt flex items-center justify-between">
          <button
            type="button"
            onClick={handleTestScraper}
            disabled={testing}
            className="px-4 py-2 rounded-xl bg-paper hover:bg-surface-alt border border-hairline text-ink text-xs font-semibold flex items-center space-x-2 transition-all disabled:opacity-50 shadow-subtle"
          >
            {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-ink text-ink" />}
            <span>Проверить (Тестовый обход)</span>
          </button>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-paper hover:bg-surface-alt border border-hairline text-mid-gray hover:text-ink text-xs font-semibold transition-all shadow-subtle"
            >
              Отмена
            </button>

            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-ink hover:bg-ink-soft text-paper text-xs font-bold flex items-center space-x-2 transition-all disabled:opacity-50 shadow-subtle"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Сохранить источник</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

