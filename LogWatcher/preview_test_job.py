#!/usr/bin/env python3
"""
프리뷰 테스트용 .job 파일 생성기
사용법: python preview_test_job.py "Z:\경로\파일.eps" "출력파일명"

생성된 .job 파일을 C:\TNSRip-X11\Temp\ 폴더에 복사하세요.
"""
import sys
import os

def create_preview_job(source_file_path: str, output_name: str = "MES_TEST"):
    """WorkType=1 (프리뷰 모드) .job 파일 생성"""

    job_content = f"""[JobSetting]
File={source_file_path}
PrintSetup=Default Printer Setup.tps
RaPInfoFile=
JobID=999999999
WorkType=1
SourceSizeX=0.000000
SourceSizeY=0.000000
DestSizeX=0.000000
DestSizeY=0.000000
XScale=1.000000
YScale=1.000000
TileOption=0
ColTileCount=0
RowTileCount=0
TotalTileNum=0
OutputTileNum=0
OverlapOption=0
OverlapX=0.000000
OverlapY=0.000000
CopyOption=0
CopyStyle=0
CopyMethod=0
CopyColNum=1
CopyRowNum=1
CopyColSpace=0.000000
CopyRowSpace=0.000000
PageRange=0
PageCount=0
PageBegin=0
PageEnd=0
MarkStyle=0
CropMarkShape=0
CropMarkColorIndex=0
CropMarkColor=0,0,0,0
SewingLineMarkShape=0
SewingLineMarkColorIndex=0
SewingLineMarkColor=0,0,0,0
CropMarkDashOnLen=0.000000
CropMarkDashOffLen=0.000000
SewingMarkDashOnLen=0.000000
SewingMarkDashOffLen=0.000000
BeginDate=
BeginTime=
EndDate=
EndTime=
MaxMarkWidth_v2=12.700000
CuttingMarkShape_v2=0
ColorBandWidth_v2=10.000000
ColorBandSpace_v2=10.000000
ColorBandOption_v2=0
MarkLineWidth_v2=0.100000
SewingLineWidth_v2=0.100000
LabelPosition_v2=0
LabelFont_v2=0
LabelFontSize_v2=12.000000
LabelItemFlags_v2=0
LabelUserComment_v2=
OverlapBkgPrint_v2=0
OverlapPosition_v2=0
MarkExt_Top_v2=0.000000
MarkExt_Bottom_v2=0.000000
MarkExt_Left_v2=0.000000
MarkExt_Right_v2=0.000000
CutSetup_v2=none
LabelFont_v3=Arial
CutParameter_0=6.000000
CutParameter_1=50.000000
CutParameter_2=500.000000
CutParameter_3=500.000000
CutParameter_4=2.000000
CutParameter_5=0.000000
CutParameterExt_0=1
CutParameterExt_1=0
CutParameterExt_2=0
CutParameterExt_3=0
CutParameterExt_4=0
CutParameterExt_5=0
BBoxExt_Top_v2=0.000000
BBoxExt_Bottom_v2=0.000000
BBoxExt_Left_v2=0.000000
BBoxExt_Right_v2=0.000000
[PrinterSetting]
Printer=EP 1850
PortStr=127.0.0.1_9100 [TNS TCP/IP]
VScreenMode=1
ResampleMethod=1
TextAntiAliasing=0
GraphicAntiAliasing=0
ImageInterpolation=0
GradationLevel=2
ColorModel=0
OutputMode=0
DPI=0
Direction=0
Pass=0
Speed=0
DotSize=0
OverPrint=0
OutputControl=0
CheckBar=0
RET=0
ProcEndCommand=0
MediaName=Plain Paper
Rotate=0
Mirror=0
SepPlane=255
LayoutType=0
FitToPage=0
MediaType=0
TrayType=0
MediaSizeX=0.000000
MediaSizeY=0.000000
LeftMargin=0.000000
TopMargin=0.000000
RightMargin=0.000000
BottomMargin=0.000000
OffsetX=0.000000
OffsetY=0.000000
CompensationUnitLength=0.000000
CompensationLength=0.000000
CompensationUnitWidth=0.000000
CompensationWidth=0.000000
MediaOptionUse=1
DryTime=0
AutoCut=0
Margin=0
Inkset=-1
DitherType=9
Frequency=80
Angles=15,75,0,45,15,75,0,45
SpotType=0
FMDotSize=0
DitherOpt=1
icmUse=1
TCMFileName=Default CMS.tcm
CustomColorModel_v2=Default
CustomColorModelFileName_v2=Default
ExtPassWeave_v3=0
VDSExt_v3=Enhance
UseHeadLayerOption_v4=1
ReversePrint_v4=0
HeadLayerNnum_v4=1
PrintmodePerHeadPayer_v4=3
MUTOH_HeadSelection=0
MUTOH_NozzleSelection=0
MUTOH_PrtAreaIndication=0
MUTOH_PrintCount=0
MUTOH_PrintCount_Interval=0
MUTOH_PrintCount_Count2=0
MUTOH_PrintCount_Count3=0
MUTOH_PrintCount_Count4=0
MUTOH_UVCTRL_USE=0
MUTOH_UVCTRL_CWLeftLED=0,0,0,0
MUTOH_UVCTRL_CWRightLED=0,0,0,0
MUTOH_UVCTRL_CCWLeftLED=0,0,0,0
MUTOH_UVCTRL_CCWRightLED=0,0,0,0
SolidLayerSetupFileName_v5=none
NotPrintAllSpotObject_v2=0
CutContourProcess_v2=1
MakeCutContourForImageArea_v2=0
CutContourPrefix_v2=CutContour
RMBCEnable_V2=0
RMBCTolerance_V2=0
RMBCBkColor_V2=0.0,0.0,0.0,0.0
RemoveOverprint=0
[ColorSetting]
icmInputRGBProfile=E:\\TNSRip-X1\\ICCProfile\\RGB\\DefRGB.icm
icmInputCMYKProfile=E:\\TNSRip-X1\\ICCProfile\\CMYK\\DefCMYK.icc
icmOutputProfile=none
icmImageIntent=0
icmVectorIntent=0
icmFlags=0
LinearCurve=E:\\TNSRip-X1\\ICCProfile\\Default.tlc
LutTable=E:\\TNSRip-X1\\ICCProfile\\Default.lut
LutDensity=100.000000,100.000000,100.000000,100.000000,100.000000,100.000000,100.000000,100.000000
UseIncreaseDMax=0
ImagePureHue=0,0,0,0,0,0,0,0
VectorPureHue=0,0,0,0,0,0,0,0
IncreaseDMax=30,30,30,30,30,30
IncreaseDMaxXPos=80,80,80,80,80,80
LutCurveApplyTo=0
Brightness=0.000000
Contrast=0.000000
TotalInkLimit=400.000000
GBApplyTo=0
GBTable=none
SCRTable=none
UseExtInkLimit_v2=0
CM2InkLimit_v2=200.000000
CY2InkLimit_v2=200.000000
CK2InkLimit_v2=200.000000
MY2InkLimit_v2=200.000000
MK2InkLimit_v2=200.000000
YK2InkLimit_v2=200.000000
CMY3InkLimit_v2=300.000000
CMK3InkLimit_v2=300.000000
CYK3InkLimit_v2=300.000000
MYK3InkLimit_v2=300.000000
icmInputRGBVectorProfile_v2=E:\\TNSRip-X1\\ICCProfile\\RGB\\DefRGB.icm
icmInputCMYKVectorProfile_v2=E:\\TNSRip-X1\\ICCProfile\\CMYK\\DefCMYK.icc
LICCurveName_v4=Default"""

    # EUC-KR 인코딩으로 저장
    job_filename = f"{output_name}0000.job"

    try:
        with open(job_filename, 'w', encoding='euc-kr') as f:
            f.write(job_content)
        print(f"[OK] 생성 완료: {job_filename}")
        print(f"[OK] 소스 파일: {source_file_path}")
        print(f"\n다음 단계:")
        print(f"  1. {job_filename} 을 C:\\TNSRip-X11\\Temp\\ 에 복사")
        print(f"  2. RIP 프로그램 프리뷰에 파일이 뜨는지 확인")
        print(f"  3. 안 뜨면 Job 폴더에도 테스트")
    except Exception as e:
        print(f"[ERROR] {e}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python preview_test_job.py \"Z:\\경로\\파일.eps\" [출력파일명]")
        print("예: python preview_test_job.py \"Z:\\동산현수막\\테스트.eps\" \"MES_TEST\"")
        sys.exit(1)

    source = sys.argv[1]
    name = sys.argv[2] if len(sys.argv) > 2 else "MES_PREVIEW_TEST"
    create_preview_job(source, name)
