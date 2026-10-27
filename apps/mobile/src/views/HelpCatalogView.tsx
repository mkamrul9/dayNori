import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  BackHandler,
} from 'react-native';
import { colors, spacing, typography } from '@daynori/design-tokens';
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  HELP_COMMON_TASK_ARTICLE_IDS,
  HELP_TROUBLESHOOT_ARTICLE_IDS,
  articleSummary,
  articleTitle,
  findHelpArticle,
  getLearningChapters,
  resolveHelpText,
  searchCatalogHelp,
  type HelpArticle,
} from '@daynori/domain';
import { Icon, MobileButton, MobileCard } from '@daynori/ui-mobile';

type ThemeMode = 'light' | 'dark';

export function HelpCatalogView(props: {
  themeMode: ThemeMode;
  userId?: string | null;
  onClose: () => void;
  onReplayOnboarding?: () => void;
  onStartGuidedTour?: () => void;
  onOpenSupport?: () => void;
}) {
  const { themeMode, onClose, onReplayOnboarding, onStartGuidedTour, onOpenSupport } = props;
  const palette = colors[themeMode];
  const [query, setQuery] = useState('');
  const [articleId, setArticleId] = useState<string | null>(null);
  const [showLearn, setShowLearn] = useState(false);

  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (articleId) {
        setArticleId(null);
        return true;
      }
      if (showLearn) {
        setShowLearn(false);
        return true;
      }
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [articleId, showLearn, onClose]);

  const hits = useMemo(() => searchCatalogHelp(query), [query]);
  const article = findHelpArticle(articleId);
  const chapters = useMemo(() => getLearningChapters(), []);

  if (article) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: palette.bg }}
        contentContainerStyle={{ padding: spacing.base, paddingBottom: spacing.xl }}
      >
        <MobileButton themeMode={themeMode} variant="secondary" onPress={() => setArticleId(null)}>
          Back
        </MobileButton>
        <Text style={[styles.title, { color: palette.text.primary, marginTop: spacing.md }]}>
          {articleTitle(article)}
        </Text>
        <Text style={[styles.body, { color: palette.text.secondary }]}>{articleSummary(article)}</Text>
        {article.gatedFeature ? (
          <Text style={[styles.body, { color: palette.text.secondary, marginTop: spacing.sm }]}>
            This feature may be unavailable in your build. Steps describe intended behavior when
            enabled.
          </Text>
        ) : null}
        <Text style={[styles.heading, { color: palette.text.primary }]}>Steps</Text>
        {article.steps.map((s, i) => (
          <Text key={s.instruction.key} style={[styles.body, { color: palette.text.primary }]}>
            {i + 1}. {resolveHelpText(s.instruction)}
          </Text>
        ))}
        <Text style={[styles.heading, { color: palette.text.primary }]}>Expected result</Text>
        <Text style={[styles.body, { color: palette.text.secondary }]}>
          {resolveHelpText(article.expectedResult)}
        </Text>
        {article.failures.map((f) => (
          <Text key={f.symptom.key} style={[styles.body, { color: palette.text.secondary }]}>
            {resolveHelpText(f.symptom)} — {resolveHelpText(f.recovery)}
          </Text>
        ))}
      </ScrollView>
    );
  }

  if (showLearn) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: palette.bg }}
        contentContainerStyle={{ padding: spacing.base, paddingBottom: spacing.xl }}
      >
        <MobileButton themeMode={themeMode} variant="secondary" onPress={() => setShowLearn(false)}>
          Back to Help
        </MobileButton>
        <Text style={[styles.title, { color: palette.text.primary, marginTop: spacing.md }]}>
          Learn the app
        </Text>
        <Text style={[styles.body, { color: palette.text.secondary }]}>
          Chapters prepare for guided practice. Reading an article does not complete practice. Only
          runnable chapters start the action-verified tour.
        </Text>
        {chapters.map((ch) => (
          <MobileCard key={ch.id} themeMode={themeMode} style={{ marginTop: spacing.sm }}>
            <Text style={{ fontWeight: '700', color: palette.text.primary }}>
              {resolveHelpText(ch.title)}
            </Text>
            <Text style={[styles.body, { color: palette.text.secondary }]}>
              {resolveHelpText(ch.stateExplanation)}
            </Text>
            {ch.state === 'runnable' && onStartGuidedTour ? (
              <MobileButton
                themeMode={themeMode}
                variant="primary"
                onPress={onStartGuidedTour}
                style={{ marginTop: spacing.sm }}
                testID="help-start-tour-task-create-save"
              >
                Start guided chapter
              </MobileButton>
            ) : ch.state === 'available_replay' && onReplayOnboarding ? (
              <MobileButton
                themeMode={themeMode}
                variant="secondary"
                onPress={onReplayOnboarding}
                style={{ marginTop: spacing.sm }}
              >
                Replay beginner guide
              </MobileButton>
            ) : (
              <Text style={{ marginTop: spacing.sm, fontSize: 12, color: palette.text.secondary }}>
                Guided practice unavailable
              </Text>
            )}
            {ch.relatedArticleIds.map((id) => {
              const a = findHelpArticle(id);
              if (!a) return null;
              return (
                <Pressable key={id} onPress={() => setArticleId(id)} style={{ marginTop: spacing.xs }}>
                  <Text style={{ color: palette.brand.primary, fontWeight: '600' }}>
                    {articleTitle(a)}
                  </Text>
                </Pressable>
              );
            })}
          </MobileCard>
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: spacing.base, paddingBottom: spacing.xl }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[styles.title, { color: palette.text.primary }]}>Help</Text>
        <MobileButton themeMode={themeMode} variant="secondary" onPress={onClose} accessibilityLabel="Close Help">
          Close
        </MobileButton>
      </View>
      <Text style={[styles.body, { color: palette.text.secondary }]}>
        Search instructional Help only — not your notes or journal.
      </Text>

      <TextInput
        accessibilityLabel="Search how-to"
        value={query}
        onChangeText={setQuery}
        placeholder="e.g. routine, sync, offline"
        placeholderTextColor={palette.text.secondary}
        style={{
          marginTop: spacing.sm,
          minHeight: 48,
          borderWidth: 1,
          borderColor: palette.border.subtle,
          borderRadius: 8,
          paddingHorizontal: spacing.sm,
          color: palette.text.primary,
          backgroundColor: palette.surface,
        }}
      />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md }}>
        <MobileButton themeMode={themeMode} variant="secondary" onPress={() => setShowLearn(true)}>
          <Icon name="graduation" /> Learn the app
        </MobileButton>
        {onReplayOnboarding ? (
          <MobileButton themeMode={themeMode} variant="secondary" onPress={onReplayOnboarding}>
            Replay beginner guide
          </MobileButton>
        ) : null}
        {onOpenSupport ? (
          <MobileButton themeMode={themeMode} variant="secondary" onPress={onOpenSupport}>
            Support
          </MobileButton>
        ) : null}
      </View>

      <Text style={[styles.heading, { color: palette.text.primary }]}>
        {query.trim() ? 'Results' : 'Common tasks'}
      </Text>
      {(query.trim()
        ? hits.map((h) => ({ id: h.articleId, title: h.title, summary: h.summary }))
        : HELP_COMMON_TASK_ARTICLE_IDS.map((id) => {
            const a = findHelpArticle(id);
            return a
              ? { id: a.id, title: articleTitle(a), summary: articleSummary(a) }
              : null;
          }).filter(Boolean)
      ).map((row) =>
        row ? (
          <Pressable
            key={row.id}
            onPress={() => setArticleId(row.id)}
            accessibilityRole="button"
            style={{ paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.border.subtle }}
          >
            <Text style={{ fontWeight: '700', color: palette.brand.primary }}>{row.title}</Text>
            <Text style={[styles.body, { color: palette.text.secondary }]}>{row.summary}</Text>
          </Pressable>
        ) : null
      )}
      {query.trim() && hits.length === 0 ? (
        <Text style={[styles.body, { color: palette.text.secondary }]}>No matching Help articles.</Text>
      ) : null}

      <Text style={[styles.heading, { color: palette.text.primary }]}>Troubleshoot</Text>
      {HELP_TROUBLESHOOT_ARTICLE_IDS.map((id) => {
        const a = findHelpArticle(id);
        if (!a) return null;
        return (
          <Pressable key={id} onPress={() => setArticleId(id)} style={{ paddingVertical: 6 }}>
            <Text style={{ color: palette.brand.primary, fontWeight: '600' }}>{articleTitle(a)}</Text>
          </Pressable>
        );
      })}

      <Text style={[styles.heading, { color: palette.text.primary }]}>Categories</Text>
      {[...HELP_CATEGORIES]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((cat) => (
          <View key={cat.id} style={{ marginBottom: spacing.sm }}>
            <Text style={{ fontWeight: '700', color: palette.text.primary }}>
              {resolveHelpText(cat.title)}
            </Text>
            {HELP_ARTICLES.filter((a) => a.categoryId === cat.id).map((a: HelpArticle) => (
              <Pressable key={a.id} onPress={() => setArticleId(a.id)} style={{ paddingVertical: 4 }}>
                <Text style={{ color: palette.brand.primary }}>{articleTitle(a)}</Text>
              </Pressable>
            ))}
          </View>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: typography.webScale?.sectionHeading ?? 20, fontWeight: '800' },
  heading: { marginTop: spacing.md, marginBottom: spacing.xs, fontSize: 16, fontWeight: '700' },
  body: { marginTop: 4, fontSize: 13, lineHeight: 18 },
});
