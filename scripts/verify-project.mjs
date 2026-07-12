import { failures, root, walk } from './verify/runtime.mjs';
import {
  checkSyntax,
  checkIndexAssets,
  checkLocalImports,
  checkCssImports,
  checkBrowserContracts,
  checkDataModuleImportContracts,
  checkApiOriginContracts,
  checkRetiredRefactorArtifacts,
  checkFileSizeGuard,
} from './verify/checks/static-checks.mjs';
import {
  checkDeploymentConfig,
  checkRetiredPhoneCollectionPurged,
  checkRetiredRunArtifacts,
  checkPagesBuild,
} from './verify/checks/deployment-checks.mjs';
import {
  checkAndroidLocalNotificationContracts,
  checkAndroidCaptureTransactionSmoke,
  checkRewardWidgetBridgeContracts,
  checkRewardWidgetProviderContracts,
} from './verify/checks/android-checks.mjs';
import {
  checkReceiptEnricherSmsGmailMergeSmoke,
  checkTossKimTaewooSelfTransferExclusion,
  checkRewardSavingsTriplePointSmoke,
  checkTelegramNewsfeedContracts,
  checkTxDetailCompactRefundContracts,
  checkPureDomainRuleOwnership,
  checkReportFeatureOwnership,
  checkFinanceFeatureOwnership,
  checkSettingsFeatureOwnership,
} from './verify/checks/domain-checks.mjs';

async function main() {
  const files = await walk(root);
  const jsFiles = files.filter(file => /\.(js|mjs)$/.test(file));
  const sourceFiles = files.filter(file => /\.(js|mjs|html)$/.test(file));

  await checkSyntax(jsFiles);
  await checkIndexAssets();
  await checkLocalImports(sourceFiles);
  await checkCssImports();
  await checkBrowserContracts(files);
  await checkDataModuleImportContracts(files);
  await checkApiOriginContracts();
  await checkRetiredRefactorArtifacts();
  await checkFileSizeGuard();
  await checkDeploymentConfig();
  await checkAndroidLocalNotificationContracts();
  await checkAndroidCaptureTransactionSmoke();
  await checkReceiptEnricherSmsGmailMergeSmoke();
  await checkRetiredPhoneCollectionPurged(files);
  await checkRetiredRunArtifacts();
  await checkPagesBuild();
  await checkTossKimTaewooSelfTransferExclusion();
  await checkRewardSavingsTriplePointSmoke();
  await checkRewardWidgetBridgeContracts();
  await checkRewardWidgetProviderContracts();
  await checkTelegramNewsfeedContracts();
  await checkTxDetailCompactRefundContracts();
  await checkPureDomainRuleOwnership();
  await checkReportFeatureOwnership();
  await checkFinanceFeatureOwnership();
  await checkSettingsFeatureOwnership();

  if (failures.length) {
    console.error(`verify-project failed with ${failures.length} issue(s):`);
    for (const item of failures) console.error(`- ${item}`);
    process.exit(1);
  }
  console.log(`verify-project passed (${jsFiles.length} JS files checked).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
