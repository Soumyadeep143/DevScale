using UnrealBuildTool;
public class BangaloreLifeSimEditorTarget : TargetRules { public BangaloreLifeSimEditorTarget(TargetInfo Target) : base(Target) { Type = TargetType.Editor; DefaultBuildSettings = BuildSettingsVersion.Latest; IncludeOrderVersion = EngineIncludeOrderVersion.Latest; ExtraModuleNames.Add("BangaloreLifeSim"); } }
