// ============================================
// GENERATE LESSON
// ============================================

router.post('/generate', authenticate, async (req, res) => {
  try {
    const { grade, subject, topic, classSize, curriculum } = req.body;
    const size = parseInt(classSize) || 40;
    const boys = Math.floor(size * 0.45);
    const girls = size - boys;

    if (!grade || !subject || !topic) {
      return res.status(400).json({ error: 'Grade, subject, and topic are required' });
    }

    // ✅ Check lesson limit (freemium)
    const limitCheck = await checkLessonLimit(req.userId);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: limitCheck.message,
        remaining: 0,
        upgradeUrl: '/pricing',
        plan: 'free'
      });
    }

    // ✅ Get user info
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { fullName: true, school: true, province: true, district: true }
    });

    const teacherName = user?.fullName || 'MR/MRS';
    const schoolName = user?.school || 'KASHINAKAZHI SECONDARY SCHOOL';
    const province = user?.province || 'Southern';
    const district = user?.district || 'Itezhi-Tezhi';

    const curriculumType = curriculum || 'cbc';

    let prompt;
    if (curriculumType === 'obc') {
      prompt = buildOBCPrompt(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district);
    } else {
      prompt = buildCBCPrompt(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district);
    }

    let lessonData;
    let useMock = true; // Default to mock

    // ✅ Skip DeepSeek if FORCE_MOCK is true
    if (deepseekClient && !FORCE_MOCK) {
      try {
        const completion = await deepseekClient.chat.completions.create({
          model: "deepseek-v4-flash",
          messages: [
            { role: "system", content: "You are an expert Zambian teacher following the Ministry of Education curriculum standards. Always respond with valid JSON only." },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 4096
        });

        console.log('📝 DeepSeek response received');

        try {
          lessonData = JSON.parse(completion.choices[0].message.content);
          useMock = false;
        } catch (parseError) {
          console.log('⚠️ Failed to parse DeepSeek response:', parseError.message);
          useMock = true;
        }
      } catch (error) {
        console.error('❌ DeepSeek API error:', error.message);
        useMock = true;
      }
    } else {
      console.log('📝 Using mock mode');
    }

    // Use mock if needed
    if (useMock) {
      console.log('📝 Generating mock lesson');
      if (curriculumType === 'obc') {
        lessonData = generateOBCMockLesson(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district);
      } else {
        lessonData = generateCBCMockLesson(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district);
      }
    }

    // ✅ Ensure topic is always present
    lessonData.topic = lessonData.topic || topic;
    lessonData.title = lessonData.title || lessonData.topic || topic;

    // ✅ Save to database
    const lesson = {
      id: `lesson-${Date.now()}`,
      userId: req.userId,
      ...lessonData,
      teacherName: teacherName,
      school: schoolName,
      province: province,
      district: district,
      curriculum: curriculumType,
      classSize: size,
      createdAt: new Date().toISOString()
    };

    console.log('📝 Saving lesson with topic:', lesson.topic);

    await prisma.lesson.create({
      data: {
        id: lesson.id,
        userId: lesson.userId,
        grade: lesson.grade,
        subject: lesson.subject,
        topic: lesson.topic,
        title: lesson.title || lesson.topic,
        classSize: lesson.classSize,
        duration: lesson.duration,
        curriculum: lesson.curriculum,
        objectives: lesson.objectives || [],
        development: lesson.development || [],
        activities: lesson.activities || [],
        assessment: lesson.assessment || '',
        curriculumCodes: lesson.curriculumCodes || [],
        provinceContext: lesson.province,
        teacherName: lesson.teacherName,
        school: lesson.school,
        province: lesson.province,
        district: lesson.district,
        date: lesson.date,
        time: lesson.time,
        boys: lesson.boys,
        girls: lesson.girls,
        generalCompetences: lesson.generalCompetences || [],
        specificCompetence: lesson.specificCompetence || '',
        lessonGoal: lesson.lessonGoal || '',
        rationale: lesson.rationale || '',
        priorKnowledge: lesson.priorKnowledge || '',
        references: lesson.references || [],
        learningEnvironment: lesson.learningEnvironment || '',
        materials: lesson.materials || [],
        expectedStandard: lesson.expectedStandard || '',
        lessonProgression: lesson.lessonProgression || [],
        homework: lesson.homework || '',
        lessonEvaluation: lesson.lessonEvaluation || '',
        learningOutcomes: lesson.learningOutcomes || [],
        lessonDevelopment: lesson.lessonDevelopment || [],
        learnersEvaluation: lesson.learnersEvaluation || [],
        teachingAids: lesson.teachingAids || [],
        subtopic: lesson.subtopic || '',
        teacherEvaluation: lesson.teacherEvaluation || '',
      }
    });

    // ✅ Increment lesson count
    await prisma.user.update({
      where: { id: req.userId },
      data: { lessonsUsed: { increment: 1 } }
    });

    console.log(`✅ Lesson generated for user: ${req.userId} (${curriculumType})`);
    res.status(201).json(lesson);

  } catch (error) {
    console.error('❌ Generation error:', error);
    res.status(500).json({ error: 'Failed to generate lesson', details: error.message });
  }
});
