import type {
  MotionEditorProjectSnapshot,
  MotionEditorCanonicalExportResult,
  MotionEditorProjectBackupV1,
  MotionEditorRecoverySnapshotV1,
  MotionEditorSaveResult,
  MotionEditorSchemaCompatibility,
  MotionEditorDiagnosticExport,
  ProductionPublishPlan,
  RecentMotionEditorProjectV1,
} from "../project/manifest";

export interface MotionEditorHost {
  chooseProjectDirectory(): Promise<string | null>;
  chooseArtworkAndAssets(): Promise<string[] | null>;
  readProject(root: string): Promise<MotionEditorProjectSnapshot>;
  saveProject(root: string, snapshot: MotionEditorProjectSnapshot): Promise<MotionEditorSaveResult>;
  saveProjectAs(target: string, snapshot: MotionEditorProjectSnapshot): Promise<MotionEditorSaveResult>;
  getProjectCompatibility(root: string): Promise<MotionEditorSchemaCompatibility>;
  listProjectBackups(root: string): Promise<MotionEditorProjectBackupV1[]>;
  restoreProjectBackup(root: string, backupId: string): Promise<MotionEditorSaveResult>;
  listRecentProjects(): Promise<RecentMotionEditorProjectV1[]>;
  removeRecentProject(root: string): Promise<void>;
  readRecoveryCandidates(): Promise<MotionEditorRecoverySnapshotV1[]>;
  writeRecovery(recoverySnapshot: MotionEditorRecoverySnapshotV1): Promise<void>;
  discardRecovery(projectId: string): Promise<void>;
  exportDiagnostics(): Promise<MotionEditorDiagnosticExport>;
  exportCanonicalAssets(snapshot: MotionEditorProjectSnapshot): Promise<MotionEditorCanonicalExportResult | null>;
  prepareProductionPublish(snapshot: MotionEditorProjectSnapshot): Promise<ProductionPublishPlan>;
  commitProductionPublish(planId: string): Promise<string>;
  cancelProductionPublish(planId: string): Promise<void>;
  revealPath(path: string): Promise<void>;
}
