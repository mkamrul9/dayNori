import { colors, spacing, radii } from '@daynori/design-tokens';
import { Button, Card } from '@daynori/ui-web';

export default function HomePage() {
  return (
    <main
      id="main-content"
      style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: `${spacing.xl}px ${spacing.base}px`,
      }}
    >
      <header style={{ marginBottom: `${spacing.lg}px` }}>
        <h1
          style={{
            fontSize: '32px',
            color: colors.light.text.primary,
            marginBottom: `${spacing.sm}px`,
          }}
        >
          Daynori
        </h1>
        <p
          style={{
            fontSize: '18px',
            color: colors.light.text.secondary,
            marginTop: 0,
          }}
        >
          Your day, gathered. A customizable home for notes, routines, tasks, and everyday life.
        </p>
      </header>

      <Card style={{ marginBottom: `${spacing.lg}px` }}>
        <div
          style={{
            display: 'inline-block',
            backgroundColor: colors.light.action.primary,
            color: colors.light.action.label,
            padding: `${spacing.xs}px ${spacing.sm}px`,
            borderRadius: `${radii.sm}px`,
            fontSize: '12px',
            fontWeight: 600,
            marginBottom: `${spacing.sm}px`,
          }}
        >
          Phase 01 Active
        </div>
        <h2 style={{ fontSize: '20px', marginTop: 0, marginBottom: `${spacing.sm}px` }}>
          Toolchain & Executable Workspace Foundation
        </h2>
        <p style={{ color: colors.light.text.secondary, lineHeight: 1.5 }}>
          The typed monorepo toolchain is established with strict TypeScript rules, shared design
          tokens, contract schemas, and isolated workspace packages.
        </p>
        <div style={{ display: 'flex', gap: `${spacing.sm}px`, marginTop: `${spacing.base}px` }}>
          <Button variant="primary" id="btn-explore">
            Explore Workspace
          </Button>
          <Button variant="secondary" id="btn-docs">
            Read Specifications
          </Button>
        </div>
      </Card>
    </main>
  );
}
