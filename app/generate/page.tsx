const handleGenerate = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!topic || !grade || !subject) {
    alert("Please fill in all fields");
    return;
  }

  setIsGenerating(true);
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/lessons/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ topic, grade, subject }),
      }
    );
    const data = await response.json();
    setGeneratedLesson(data);
  } catch (error) {
    console.error("Generation failed:", error);
    alert("Failed to generate lesson. Please try again.");
  }
  setIsGenerating(false);
};
