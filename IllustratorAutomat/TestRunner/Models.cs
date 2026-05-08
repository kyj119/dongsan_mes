namespace IATestRunner;

public class BoundsInfo
{
    public double WidthMm  { get; set; }
    public double HeightMm { get; set; }
    public double LeftPt   { get; set; }
    public double TopPt    { get; set; }
    public double RightPt  { get; set; }
    public double BottomPt { get; set; }
    public int    DesignCount { get; set; }
    public string Source   { get; set; } = "auto";
    public string Date     { get; set; } = "";
}

public class TestResult
{
    public string     FileName      { get; set; } = "";
    public bool       Success       { get; set; }
    public BoundsInfo? Extracted    { get; set; }
    public BoundsInfo? Expected     { get; set; }
    public double     DiffPercent   { get; set; }
    public string     ErrorMessage  { get; set; } = "";
    public long       ElapsedMs     { get; set; }
    public string     OutputDir     { get; set; } = "";
    public bool       HasExpected   { get; set; }
}
